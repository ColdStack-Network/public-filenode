import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configModuleOptions } from '../config';
import { ObjectsModule } from '../objects/objects.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DownloaderServiceHelperService } from './downloader-service-helper.service';
import { BucketRepository } from '../objects/repositories/bucket.repository';
import { ObjectRepository } from '../objects/repositories/object.repository';
import { BandwidthUsageRepository } from '../objects/repositories/bandwidth-usage.repository';
import { BlockchainWriterModule } from '../blockchain-writer/blockchain-writer.module';
import { json } from 'body-parser';
import { OracleModule } from '../oracle/oracle.module';
import { GatewayChooserAiModule } from '../gateway-chooser-ai/gateway-chooser-ai.module';
import { v4 as uuid } from 'uuid';
import { IncomingMessage } from 'http';

@Module({
  imports: [
    AuthModule,
    ObjectsModule,
    BlockchainWriterModule,
    GatewayChooserAiModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId(req: IncomingMessage): string {
          const idHeader = req.headers['x-request-id'];
          return Array.isArray(idHeader) ? idHeader[0] : idHeader || uuid();
        },
      },
    }),
    ScheduleModule.forRoot(),
    OracleModule,
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => configService.get('typeorm'),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([ObjectRepository, BucketRepository, BandwidthUsageRepository]),
    ConfigModule.forRoot(configModuleOptions),
  ],
  controllers: [AppController],
  providers: [DownloaderServiceHelperService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(json()).forRoutes({
      path: '/__internal/bandwidth-usage-report',
      method: RequestMethod.POST,
    });
  }
}
