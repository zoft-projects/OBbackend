import serverlessExpress from '@codegenie/serverless-express';
import { Handler } from 'aws-lambda';

import { App } from './app';
import { ConfigManager } from './lib/config';
import {
  HealthCheckController,
  AuthorizeUserController,
  UserController,
  AnonUserController,
  OnboardUserController,
  NewsFeedController,
  LocationController,
  AdminController,
  SelfUserController,
  AlertController,
  PollController,
  VisitController,
  JobBoardController,
  AvailabilityController,
  JobRoleController,
  EnrollUserController,
  ChatController,
  SupportTicketController,
  FeatureProvisionsController,
  ModerationController,
  ReferralController,
  ResourceController,
  ConcernController,
  NotificationController,
  ShiftOfferController,
  PayController,
  OfferController,
  MilestoneController,
  CompetenciesController,
  MailController,
  MetricsController,
  MultimediaController,
} from './lib/controllers';
import { logInfo } from './lib/log/util';
import { initializeRedis, initializeMongoDb } from './lib/vendors';

const appConfig = ConfigManager.getAppConfig();
const port = process.env.SERVER_PORT || appConfig.envConfig.port || '8080';
let serverlessExpressInstance: Handler;

const controllers = [
  HealthCheckController,
  AdminController,
  AuthorizeUserController,
  UserController,
  AnonUserController,
  OnboardUserController,
  NewsFeedController,
  LocationController,
  SelfUserController,
  VisitController,
  JobBoardController,
  AlertController,
  PollController,
  ConcernController,
  AvailabilityController,
  JobRoleController,
  EnrollUserController,
  ChatController,
  SupportTicketController,
  FeatureProvisionsController,
  ModerationController,
  ReferralController,
  ResourceController,
  NotificationController,
  ShiftOfferController,
  PayController,
  OfferController,
  MilestoneController,
  CompetenciesController,
  MailController,
  MetricsController,
  MultimediaController,
];

const { app } = new App(
  controllers.map((Controller) => new Controller(appConfig)),
  port,
  appConfig,
);

// Initialize mongo connection on local
if (appConfig.envConfig.name === 'local') {
  initializeMongoDb();
  initializeRedis();
}

async function setupServerless(event: any, context: any, callback: any) {
  await Promise.all([initializeMongoDb(), initializeRedis()]);

  serverlessExpressInstance = serverlessExpress({ app });

  return await serverlessExpressInstance(event, context, callback);
}

exports.handler = (event: any, context: any, callback: any) => {
  logInfo(
    `Received API Gateway request with event - ${JSON.stringify(event)} and context - ${JSON.stringify(context)}`,
  );

  // Remove pathParams, if the event is from apigw 1.0, to override the default route to path from pathParameters.proxy
  if (event.version === '1.0') {
    delete event.pathParameters;
  }

  if (serverlessExpressInstance) {
    return serverlessExpressInstance(event, context, callback);
  }

  return setupServerless(event, context, callback);
};
