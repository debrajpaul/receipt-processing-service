import {
  Aws,
  Stack,
  Duration,
  CfnOutput,
  StackProps,
  RemovalPolicy,
  aws_s3 as s3,
  aws_sqs as sqs,
  aws_iam as iam,
  aws_dynamodb as dynamodb,
  aws_s3_notifications as s3n,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class DataStack extends Stack {
  public readonly receiptsBucket: s3.Bucket;
  public readonly receiptsQueue: sqs.Queue;
  public readonly receiptsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountIdentifier = this.account ?? Aws.ACCOUNT_ID;

    this.receiptsBucket = new s3.Bucket(this, 'AutomatedReceiptsBucket', {
      bucketName: `automated-receipts-${accountIdentifier}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const receiptsDlq = new sqs.Queue(this, 'ReceiptsDlq', {
      queueName: 'receipts-dlq',
      retentionPeriod: Duration.days(14),
    });

    this.receiptsQueue = new sqs.Queue(this, 'ReceiptsQueue', {
      queueName: 'receipts-queue',
      visibilityTimeout: Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: receiptsDlq,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.receiptsTable = new dynamodb.Table(this, 'ReceiptsTable', {
      tableName: 'Receipts',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'receipt_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.receiptsQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowOnlyReceiptsBucketToSend',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [this.receiptsQueue.queueArn],
        conditions: {
          ArnEquals: {
            'aws:SourceArn': this.receiptsBucket.bucketArn,
          },
          StringEquals: {
            'aws:SourceAccount': accountIdentifier,
          },
        },
      }),
    );

    this.receiptsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.receiptsQueue),
      { prefix: 'incoming/' },
    );

    new CfnOutput(this, 'ReceiptsBucketNameOutput', {
      value: this.receiptsBucket.bucketName,
      exportName: 'AutomatedReceiptsBucketName',
    });

    new CfnOutput(this, 'ReceiptsQueueUrlOutput', {
      value: this.receiptsQueue.queueUrl,
      exportName: 'ReceiptsQueueUrl',
    });

    new CfnOutput(this, 'ReceiptsQueueArnOutput', {
      value: this.receiptsQueue.queueArn,
      exportName: 'ReceiptsQueueArn',
    });

    new CfnOutput(this, 'ReceiptsTableNameOutput', {
      value: this.receiptsTable.tableName,
      exportName: 'ReceiptsTableName',
    });
  }
}