import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Response, Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { BlockchainWriterService } from '../blockchain-writer/blockchain-writer.service';
import { GatewayChooserAiService } from '../gateway-chooser-ai/gateway-chooser-ai.service';
import { GatewaysV3Service } from '../gateways/gateways-v3.service';
import { ObjectEntity } from '../objects/entities/object.entity';
import { DeletedObjectRepository } from '../objects/repositories/deleted-object.repository';
import { ObjectMetadataRepository } from '../objects/repositories/object-metadata.repository';
import { ObjectRepository } from '../objects/repositories/object.repository';
import { StatisticsService } from '../objects/statistics.service';

@Injectable()
export class DeleteObjectService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    private readonly objectMetadataRepo: ObjectMetadataRepository,
    private readonly deletedObjectRepo: DeletedObjectRepository,
    private readonly blockchainWriterService: BlockchainWriterService,
    @Inject(forwardRef(() => GatewaysV3Service))
    private readonly gatewaysV3Service: GatewaysV3Service,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    @Inject(forwardRef(() => GatewayChooserAiService))
    private readonly gatewayChooserAiService: GatewayChooserAiService,
    @InjectPinoLogger(DeleteObjectService.name)
    private readonly logger: PinoLogger,
  ) {}

  async deleteObject(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    this.logger.time('get object to delete');
    const object = await this.objectRepo.findOne({
      where: {
        bucket: params.bucket,
        key: params.key,
      },
    });

    this.logger.timeEnd('getObjectToDelete');

    if (object) {
      await this.deleteObjectFromGatewayAndBlockchainAndDB(object, user);

      this.logger.time('update stats');

      await this.statisticsService.updateBucketStorageStatistics(params.bucket);

      this.logger.timeEnd('update stats');
    }

    // TODO: add headers
    response
      .status(204)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send();
  }

  async deleteObjectFromGatewayAndBlockchainAndDB(object: ObjectEntity, user: UserFromAuthnode): Promise<void> {
    if (
      !['0x2222222222222222222222222222222222222222', '0x6ed55655a1012859aca32ab5ea36014ffebad661'].includes(
        object.gatewayEthAddress.toLowerCase(),
      )
    ) {
      this.logger.time('get gateway from AI Chooser');
      const gateway = await this.gatewayChooserAiService.getGatewayByEthereumAddress(object.gatewayEthAddress);
      this.logger.timeEnd('get gateway from AI Chooser');

      this.logger.time('delete file from gateway');
      await this.gatewaysV3Service
        .deleteFile({
          gatewayAddress: gateway.url,
          file_hash: object.fileNameSha256,
        })
        .catch((err) => {
          this.logger.error(
            `Error when trying to delete the file ${object.fileContentsSha256} from gateway ${gateway.url}: %o`,
            err,
          );
        });
      this.logger.timeEnd('delete file from gateway');
    } else {
      this.logger.info('Skipped deletion from gateway');
    }

    this.logger.time('get metadatas of file');
    const metadatas = await this.objectMetadataRepo.getMetadatasOfObject(object.id);
    this.logger.timeEnd('get metadatas of file');

    this.logger.time('add to deleted objects');
    await this.deletedObjectRepo.save({
      id: object.id,
      deletedAt: new Date(),
      bucket: object.bucket,
      key: object.key,
      object: {
        ...object,
        metadatas,
      },
    });
    this.logger.timeEnd('add to deleted objects');

    this.logger.time('delete from blockchain');
    await this.blockchainWriterService.delete({
      user_eth_address: user.user.publicKey,
      file_name_hash: '0x' + object.fileNameSha256,
    });
    this.logger.timeEnd('delete from blockchain');

    this.logger.time('delete objects and metadata from DB');
    await this.objectRepo.delete({
      bucket: object.bucket,
      key: object.key,
    });

    await this.objectMetadataRepo.deleteAllMetadatasOfObject(object.id);
    this.logger.timeEnd('delete objects and metadata from DB');
  }
}
