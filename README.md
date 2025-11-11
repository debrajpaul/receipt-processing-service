# receipt-processing-service

Automated AWS Receipt Processing System

## Infrastructure Notes
- The CDK stack provisions core storage (S3/DynamoDB), SQS queues, an ECS Fargate worker service, CloudWatch alarms, and an AWS Budget.
- Configure ops notifications via the `opsAlertEmail` (required) and `workerImageUri` (optional override) context entries in `infra/cdk.json`.
- Alarms for SQS backlog and worker log errors route to the shared `ops-alerts` SNS topic, which fan-outs to email and the budget notifications.
- The worker service auto scales between 1–10 tasks based on the SQS backlog aiming for 10 messages per task.

## Email & SES Requirements
If you send notifications or application mail via SES, ensure both the sender and recipient identities are verified manually in the AWS Console. This verification cannot be automated in the current CDK stack and must be completed before deploying to production accounts.
