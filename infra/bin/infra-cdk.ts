#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataStack, MonitoringStack, OpsStack, WorkerStack } from '../lib';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
const opsAlertEmail = app.node.tryGetContext('opsAlertEmail');

if (!opsAlertEmail || typeof opsAlertEmail !== 'string') {
  throw new Error(
    'Missing opsAlertEmail context. Please set it in cdk.json (e.g. "opsAlertEmail": "alerts@example.com").',
  );
}

const workerImageUri =
  (app.node.tryGetContext('workerImageUri') as string | undefined) || 'public.ecr.aws/docker/library/node:18-alpine';

const opsStack = new OpsStack(app, 'OpsStack', {
  env,
  opsAlertEmail,
});

const dataStack = new DataStack(app, 'DataStack', {
  env,
});

const workerStack = new WorkerStack(app, 'WorkerStack', {
  env,
  workerImageUri,
  receiptsBucket: dataStack.receiptsBucket,
  receiptsQueue: dataStack.receiptsQueue,
  receiptsTable: dataStack.receiptsTable,
});

const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env,
  receiptsQueue: dataStack.receiptsQueue,
  workerLogGroup: workerStack.workerLogGroup,
  opsAlertsTopic: opsStack.opsAlertsTopic,
});

monitoringStack.addDependency(workerStack);
monitoringStack.addDependency(dataStack);
monitoringStack.addDependency(opsStack);
