import { forwardRef, Module } from '@nestjs/common';
import { ObjectsModule } from '../objects/objects.module';
import { DeleteObjectsBulkService } from './delete-objects-bulk.service';
import { GatewaysModule } from '../gateways/gateways.module';
import { DeleteObjectService } from './delete-object.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectRepository } from '../objects/repositories/object.repository';
import { ErrorsModule } from '../errors/errors.module';
import { BlockchainWriterModule } from '../blockchain-writer/blockchain-writer.module';
import { DeleteObjectResponseFormatter } from './delete-object-response-formatter.service';
import { GatewayChooserAiModule } from '../gateway-chooser-ai/gateway-chooser-ai.module';
import { DeletedObjectRepository } from '../objects/repositories/deleted-object.repository';
import { ObjectMetadataRepository } from '../objects/repositories/object-metadata.repository';

@Module({
  imports: [
    forwardRef(() => ObjectsModule),
    forwardRef(() => GatewayChooserAiModule),
    ErrorsModule,
    GatewaysModule,
    BlockchainWriterModule,
    TypeOrmModule.forFeature([ObjectRepository, DeletedObjectRepository, ObjectMetadataRepository]),
  ],
  providers: [DeleteObjectsBulkService, DeleteObjectService, DeleteObjectResponseFormatter],
  exports: [DeleteObjectsBulkService, DeleteObjectService],
})
export class ObjectDeletionsModule {}
