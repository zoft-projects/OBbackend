import { errorAlerter, errorLogger, errorResponder, IAlertConfig } from '@bayshore-healthcare/lib-error-middleware';
import compression from 'compression';
import config from 'config';
import cors from 'cors';
import express from 'express';
import * as methodOverride from 'method-override';

import { IAppConfig, IEnvConfig } from './lib/config';
import { BaseController } from './lib/controllers/base_controller';
import { HttpStatusCode } from './lib/enums/http_status_code';
import { getAuditLogMiddleware, logInfo } from './lib/log/util';
import { addTransactionId } from './lib/middlewares';

const getCorsOptions = (corsAllowedOrigins: string[]) => ({
  origin: (origin: string | undefined, callback: (err: Error | null, origin?: boolean | string) => void) => {
    if (corsAllowedOrigins.indexOf('*') !== -1 || corsAllowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
});

export class App {
  public app: express.Application;
  public port: string;
  public alertConfig: IAlertConfig;
  public envConfig: IEnvConfig;

  constructor(controllers: BaseController[], port: string, appConfig: IAppConfig) {
    logInfo('Initializing express application');

    this.app = express();
    this.port = port;
    this.alertConfig = appConfig.alertConfig;
    this.envConfig = appConfig.envConfig;

    this.initializeMiddlewares();
    this.initializeControllers(controllers);
    if (appConfig.envConfig.name === 'local') {
      this.initializeLocalApp();
    }
  }

  private initializeMiddlewares() {
    // enable response compression
    this.app.use(
      compression({
        level: 1,
        filter: (req, res) => {
          if (req.headers['x-enable-compression']) {
            // only compress responses with this request header
            return compression.filter(req, res);
          }

          return false;
        },
      }),
    );

    // Enable cors
    this.app.use(cors(getCorsOptions(this.envConfig.accessAllowedFrom)));
    this.app.options('*', cors());

    // Enable method override
    this.app.use(methodOverride.default());

    // adding request size limit 8MB for multipart file uploads (Note: Do not change the order for setting the limit here)
    this.app.use(
      /\/onebay-api\/api\/v3\/users\/[a-zA-Z0-9]+\/file/,
      express.json({
        limit: '8MB',
        type: 'application/json',
      }),
    );

    // Support for parsing application/json
    this.app.use(
      express.json({
        limit: '1MB',
        type: 'application/json',
      }),
    );

    // Support for parsing application/x-www-form-urlencoded
    this.app.use(
      express.urlencoded({
        extended: true,
        parameterLimit: 5,
        limit: '1MB',
      }),
    );

    // transaction id middleware
    this.app.use(addTransactionId);

    // express request audit logging middleware
    this.app.use(getAuditLogMiddleware());

    // adding access control headers to response
    this.app.use((req, res, next) => {
      if (req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
      res.header('Access-Control-Allow-Methods', 'OPTIONS, DELETE, PUT, GET, POST, PATCH');
      res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');

      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
    setupSwagger(this.app);
  }

  private initializeControllers(controllers: BaseController[]) {
    controllers.forEach((controller) => {
      logInfo(`Initializing '${controller.constructor.name}' controller at path '${controller.getBasePath()}'`);
      this.app.use('/', controller.router);
    });

    // error middleware
    this.app.use(errorLogger);
    this.app.use(errorAlerter(this.alertConfig));
    this.app.use(errorResponder);

    logInfo('All middlewares added successfully to the express application');
  }

  public initializeLocalApp(): Promise<any> {
    this.app.get('/', (req, res) => res.status(HttpStatusCode.OK).send('OneBayshore Backend Service'));
    this.app.get('/favicon.ico', (req, res) => res.status(HttpStatusCode.NO_CONTENT).send());

    return new Promise((resolve) => {
      const server = this.app.listen(this.port, () => {
        logInfo(`Service started : ENVIRONMENT → ${config.get('Environment.name')}, PORT → ${this.port}`);
        server.setTimeout(30000);
        resolve(server);
      });
    });
  }
}
