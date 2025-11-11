import {
  Stack,
  StackProps,
  aws_sns as sns,
  aws_iam as iam,
  aws_sns_subscriptions as subs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface OpsStackProps extends StackProps {
  opsAlertEmail: string;
}

export class OpsStack extends Stack {
  public readonly opsAlertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: OpsStackProps) {
    super(scope, id, props);

    if (!props.opsAlertEmail) {
      throw new Error('opsAlertEmail is required to create OpsStack.');
    }

    this.opsAlertsTopic = new sns.Topic(this, 'OpsAlertsTopic', {
      topicName: 'ops-alerts',
      displayName: 'Operations Alerts',
    });
    this.opsAlertsTopic.addSubscription(new subs.EmailSubscription(props.opsAlertEmail));

    const opsAlertsTopicPolicy = new sns.TopicPolicy(this, 'OpsAlertsTopicPolicy', {
      topics: [this.opsAlertsTopic],
    });
    opsAlertsTopicPolicy.document.addStatements(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        resources: [this.opsAlertsTopic.topicArn],
      }),
    );
  }
}
