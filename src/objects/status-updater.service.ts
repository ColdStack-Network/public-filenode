import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GatewaysV3Service } from '../gateways/gateways-v3.service';
import { ObjectRepository } from './repositories/object.repository';
import { IsNull, Not, Raw } from 'typeorm';
import _ from 'lodash';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ObjectMetadataRepository } from './repositories/object-metadata.repository';
import { GatewayChooserAiService } from '../gateway-chooser-ai/gateway-chooser-ai.service';

@Injectable()
export class StatusUpdaterService {
  constructor(
    @Inject(APP_CONFIGS_KEY)
    private readonly appConfigs: TAppConfigs,
    private readonly objectRepo: ObjectRepository,
    private readonly objectMetadataRepo: ObjectMetadataRepository,
    @Inject(forwardRef(() => GatewayChooserAiService))
    private readonly gatewayChooserAiService: GatewayChooserAiService,
    @Inject(forwardRef(() => GatewaysV3Service))
    private readonly gatewaysV3Service: GatewaysV3Service,
    @InjectPinoLogger(StatusUpdaterService.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async updateStatusesAndLocations(): Promise<any> {
    const objectIdsAndHashes: {
      id: string;
      fileNameSha256?: string;
      gatewayEthAddress?: string;
    }[] = await this.objectRepo.find({
      where: {
        storageForceChosen: true,
        locationFromGateway: IsNull(),
        fileNameSha256: Not(IsNull()),
        gatewayEthAddress: Raw(
          (column) =>
            `${column} IS NOT NULL AND ${column} NOT IN ('0x2222222222222222222222222222222222222222', '0x6ed55655a1012859aca32ab5ea36014ffebad661')`,
        ),
      },
      select: ['id', 'fileNameSha256', 'gatewayEthAddress'],
    });

    const fileNameSha256ToId: Record<string, string> = {};

    objectIdsAndHashes.forEach((o) => {
      fileNameSha256ToId[o.fileNameSha256] = o.id;
    });

    this.logger.info('updateStatusesAndLocations: found ' + objectIdsAndHashes.length + ' objects to get statuses of.');

    const objectsGroupedByGatewayEthAddress = _.groupBy(objectIdsAndHashes, 'gatewayEthAddress');

    await Promise.all(
      _.keys(objectsGroupedByGatewayEthAddress).map(async (gatewayEthAddress: string) => {
        try {
          const gateway = await this.gatewayChooserAiService.getGatewayByEthereumAddress(gatewayEthAddress);
          const objects = objectsGroupedByGatewayEthAddress[gatewayEthAddress];

          const statuses = await this.gatewaysV3Service.getUploadStatuses({
            gatewayAddress: gateway.url,
            file_hashes: objects.map((o) => o.fileNameSha256),
          });

          this.logger.info(
            `updateStatusesAndLocations: ${_.values(statuses).filter((s) => s.status === 'completed').length} out of ${
              objects.length
            } completed from ${gatewayEthAddress}/${gateway.url}`,
          );

          await Promise.all(
            _.keys(statuses).map(async (fileHash) => {
              const status = statuses[fileHash];

              if (status.status === 'completed') {
                const objectId = fileNameSha256ToId[fileHash];

                await this.objectRepo.update(
                  {
                    id: objectId,
                  },
                  {
                    locationFromGateway: status.location,
                  },
                );

                await this.objectMetadataRepo.update(
                  {
                    objectId,
                    key: 'location',
                  },
                  {
                    value: status.location,
                  },
                );
              }
            }),
          );
        } catch (err) {
          this.logger.error(err);
        }
      }),
    );
  }
}
