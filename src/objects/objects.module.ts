import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectRepository } from './repositories/object.repository';
import { MultipartUploadRepository } from './repositories/multipart-upload.repository';
import { MultipartUploadPartRepository } from './repositories/multipart-upload-part.repository';
import { BucketRepository } from './repositories/bucket.repository';
import { ObjectsController } from './objects.controller';
import { AuthModule } from '../auth/auth.module';
import { ErrorsModule } from '../errors/errors.module';
import { BlockchainWriterModule } from '../blockchain-writer/blockchain-writer.module';
import { PutAndGetApiService } from './put-and-get-api.service';
import { ObjectMetadataRepository } from './repositories/object-metadata.repository';
import { MultipartApiService } from './multipart-api.service';
import { ListAndHeadApiService } from './list-and-head-api.service';
import { CommonUtilsService } from './common-utils.service';
import { GatewaysModule } from '../gateways/gateways.module';
import { BucketsService } from './buckets.service';
import { GatewayChooserAiModule } from '../gateway-chooser-ai/gateway-chooser-ai.module';
import { StatusUpdaterService } from './status-updater.service';
import { ACLService } from './acl.service';
import { StatisticsService } from './statistics.service';
import { BandwidthUsageRepository } from './repositories/bandwidth-usage.repository';
import { StorageUsageRepository } from './repositories/storage-usage.repository';
import { DeletedObjectRepository } from './repositories/deleted-object.repository';
import { OracleModule } from '../oracle/oracle.module';
import { UsersAbilitiesService } from './users-abilities.service';
import { StorageAnalyticsResponseFormatter } from './response-formatters/statistics/StorageAnalytics';
import { ListFilesResponseFormatter } from './response-formatters/list-and-head-api/ListFiles';
import { ObjectDeletionsModule } from '../object-deletions/object-deletions.module';
import { TaggingModule } from '../tagging/tagging.module';
import { BillingApiModule } from '../billing-api/billing-api.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    ErrorsModule,
    BlockchainWriterModule,
    OracleModule,
    forwardRef(() => BillingApiModule),
    forwardRef(() => TaggingModule),
    forwardRef(() => GatewaysModule),
    forwardRef(() => GatewayChooserAiModule),
    forwardRef(() => ObjectDeletionsModule),
    TypeOrmModule.forFeature([
      ObjectRepository,
      MultipartUploadRepository,
      MultipartUploadPartRepository,
      ObjectMetadataRepository,
      BucketRepository,
      BandwidthUsageRepository,
      StorageUsageRepository,
      DeletedObjectRepository,
    ]),
  ],
  providers: [
    PutAndGetApiService,
    MultipartApiService,
    ListAndHeadApiService,
    CommonUtilsService,
    BucketsService,
    StatusUpdaterService,
    ACLService,
    StatisticsService,
    UsersAbilitiesService,
    StorageAnalyticsResponseFormatter,
    ListFilesResponseFormatter,
  ],
  exports: [BucketsService, CommonUtilsService, StatisticsService],
  controllers: [ObjectsController],
})
export class ObjectsModule {}
