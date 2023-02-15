import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from 'nestjs-pino';
import morgan from 'morgan';
import childProcess from 'child_process';
import './logging/add-time-to-logger';

async function bootstrap(): Promise<void> {
  childProcess.execSync('npx typeorm migration:run', {
    stdio: 'inherit',
  });

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const logger = app.get(Logger);

  app.useLogger(logger);

  app.use(morgan('tiny'));

  app.enableCors({
    origin: '*',
    methods: 'GET, HEAD, POST, PUT, DELETE, MOVE, OPTIONS',
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: true,
  });

  const configService = app.get(ConfigService);
  const appPort = configService.get<number>('app.port');
  const appHost = configService.get<string>('app.host');

  logger.log({
    app: configService.get('app'),
    cls: configService.get('cls'),
    gateways: configService.get('gateways'),
    typeorm: configService.get('typeorm'),
  });

  await app.listen(appPort, appHost, () => {
    logger.log(`The server is listening on http://${appHost}:${appPort}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
