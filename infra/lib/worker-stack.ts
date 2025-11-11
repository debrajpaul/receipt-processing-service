import {
  Stack,
  Duration,
  StackProps,
  RemovalPolicy,
  aws_s3 as s3,
  aws_sqs as sqs,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_dynamodb as dynamodb,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface WorkerStackProps extends StackProps {
  workerImageUri: string;
  receiptsBucket: s3.Bucket;
  receiptsQueue: sqs.Queue;
  receiptsTable: dynamodb.Table;
}

export class WorkerStack extends Stack {
  public readonly workerLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: WorkerStackProps) {
    super(scope, id, props);

    const workerVpc = new ec2.Vpc(this, 'WorkerVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: workerVpc,
      description: 'Security group for the receipt worker service',
      allowAllOutbound: true,
    });

    const workerCluster = new ecs.Cluster(this, 'WorkerCluster', {
      vpc: workerVpc,
      clusterName: 'receipt-worker-cluster',
    });

    this.workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: `/aws/ecs/receipt-worker`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    const workerContainer = workerTaskDefinition.addContainer('WorkerContainer', {
      containerName: 'receipt-worker',
      image: ecs.ContainerImage.fromRegistry(props.workerImageUri),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: this.workerLogGroup,
        streamPrefix: 'worker',
      }),
      environment: {
        RECEIPTS_QUEUE_URL: props.receiptsQueue.queueUrl,
        RECEIPTS_TABLE_NAME: props.receiptsTable.tableName,
        RECEIPTS_BUCKET_NAME: props.receiptsBucket.bucketName,
      },
    });
    workerContainer.addPortMappings({
      containerPort: 8080,
    });

    props.receiptsQueue.grantConsumeMessages(workerTaskDefinition.taskRole);
    props.receiptsBucket.grantReadWrite(workerTaskDefinition.taskRole);
    props.receiptsTable.grantReadWriteData(workerTaskDefinition.taskRole);

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      serviceName: 'receipt-worker-service',
      cluster: workerCluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [workerSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
    });

    const workerScaling = workerService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    workerScaling.scaleToTrackCustomMetric('SqsBacklogTargetTracking', {
      metric: props.receiptsQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      targetValue: 10,
    });
  }
}