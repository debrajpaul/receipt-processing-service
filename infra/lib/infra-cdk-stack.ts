import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export class InfraCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const accountIdentifier = this.account ?? cdk.Aws.ACCOUNT_ID;

    const receiptsBucket = new s3.Bucket(this, 'AutomatedReceiptsBucket', {
      bucketName: `automated-receipts-${accountIdentifier}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const receiptsDlq = new sqs.Queue(this, 'ReceiptsDlq', {
      queueName: 'receipts-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const receiptsQueue = new sqs.Queue(this, 'ReceiptsQueue', {
      queueName: 'receipts-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: receiptsDlq,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    receiptsQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowOnlyReceiptsBucketToSend',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [receiptsQueue.queueArn],
        conditions: {
          ArnEquals: {
            'aws:SourceArn': receiptsBucket.bucketArn,
          },
          StringEquals: {
            'aws:SourceAccount': accountIdentifier,
          },
        },
      }),
    );

    receiptsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(receiptsQueue),
      { prefix: 'incoming/' },
    );

    const receiptsTable = new dynamodb.Table(this, 'ReceiptsTable', {
      tableName: 'Receipts',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'receipt_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'ReceiptsBucketNameOutput', {
      value: receiptsBucket.bucketName,
      exportName: 'AutomatedReceiptsBucketName',
    });

    new cdk.CfnOutput(this, 'ReceiptsQueueUrlOutput', {
      value: receiptsQueue.queueUrl,
      exportName: 'ReceiptsQueueUrl',
    });

    new cdk.CfnOutput(this, 'ReceiptsQueueArnOutput', {
      value: receiptsQueue.queueArn,
      exportName: 'ReceiptsQueueArn',
    });

    new cdk.CfnOutput(this, 'ReceiptsTableNameOutput', {
      value: receiptsTable.tableName,
      exportName: 'ReceiptsTableName',
    });
  }
}
