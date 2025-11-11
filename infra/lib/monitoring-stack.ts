import {
  Stack,
  Duration,
  StackProps,
  aws_sns as sns,
  aws_sqs as sqs,
  aws_logs as logs,
  aws_budgets as budgets,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatch_actions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends StackProps {
  receiptsQueue: sqs.Queue;
  workerLogGroup: logs.LogGroup;
  opsAlertsTopic: sns.ITopic;
}

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const workerErrorMetricFilter = new logs.MetricFilter(this, 'WorkerErrorMetricFilter', {
      logGroup: props.workerLogGroup,
      metricNamespace: 'ReceiptProcessing',
      metricName: 'WorkerErrors',
      metricValue: '1',
      defaultValue: 0,
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'Error', 'Unhandled'),
    });

    const queueBacklogAlarm = new cloudwatch.Alarm(this, 'ReceiptsQueueBacklogAlarm', {
      alarmDescription: 'Receipts queue backlog exceeds 50 messages for 5 minutes',
      metric: props.receiptsQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 50,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    const workerErrorAlarm = new cloudwatch.Alarm(this, 'WorkerErrorAlarm', {
      alarmDescription: 'Worker logs contain errors for 5 minutes',
      metric: workerErrorMetricFilter.metric({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    const opsAlarmAction = new cloudwatch_actions.SnsAction(props.opsAlertsTopic);
    queueBacklogAlarm.addAlarmAction(opsAlarmAction);
    workerErrorAlarm.addAlarmAction(opsAlarmAction);

    new budgets.CfnBudget(this, 'ReceiptsBudget', {
      budget: {
        budgetLimit: {
          amount: 2000,
          unit: 'INR',
        },
        budgetName: 'ReceiptsBudget',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'ACTUAL',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              address: props.opsAlertsTopic.topicArn,
              subscriptionType: 'SNS',
            },
          ],
        },
      ],
    });
  }
}