import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BucketsService } from '../objects/buckets.service';
import { BucketRepository } from '../objects/repositories/bucket.repository';
import { ObjectRepository } from '../objects/repositories/object.repository';
import { BlockchainWriterService } from '../blockchain-writer/blockchain-writer.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BandwidthUsageReportByDownloaderServiceDto } from './dto/BandwidthUsageReportByDownloaderService.dto';
import { CommonUtilsService } from '../objects/common-utils.service';
import { GatewayChooserAiService } from '../gateway-chooser-ai/gateway-chooser-ai.service';
import { StatisticsService } from '../objects/statistics.service';

@Injectable()
export class DownloaderServiceHelperService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    private readonly bucketRepo: BucketRepository,
    private readonly bucketsService: BucketsService,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    private readonly blockchainWriterService: BlockchainWriterService,
    private readonly gatewayChooserAiService: GatewayChooserAiService,
    @InjectPinoLogger(DownloaderServiceHelperService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtils: CommonUtilsService,
  ) {}

  async getObjectWithMetadatasAndBucketAndGateway(bucketName: string, key: string): Promise<any> {
    const object = await this.objectRepo.findByKeyAndBucketAndJoinMetadatas(key, bucketName);

    if (!object) {
      throw new NotFoundException();
    }

    const bucket = await this.bucketRepo.findByNameOrFail(object.bucket);

    const gateway = await this.gatewayChooserAiService.getGatewayByEthereumAddress(object.gatewayEthAddress);

    return {
      object,
      bucket,
      gateway,
    };
  }

  async getBucketsByOwnerPublicKey(ownerPublicKey: string): Promise<any> {
    const buckets = await this.bucketsService.findBucketsByOwnerPublicKey(ownerPublicKey);

    return buckets;
  }

  async reportBandwidthUsage(params: BandwidthUsageReportByDownloaderServiceDto): Promise<void> {
    const object = await this.objectRepo.findOne({ where: { fileNameSha256: params.fileHash } });

    if (!object) {
      throw new BadRequestException(`Object with hash ${params.fileHash} not found.`);
    }

    const bucket = await this.bucketRepo.findOneOrFail({ where: { name: object.bucket } });

    this.statisticsService
      .reportBandwidthUsage({
        bucketName: object.bucket,
        size: params.bandwidthUsed,
        type: 'download',
        info: {
          bucket: object.bucket,
          key: object.key,
          err: params.err ? `${params.err}` : undefined,
          gatewayAddress: params.gatewayAddress,
        },
      })
      .catch((err) => {
        this.logger.error('Error reporting bandwidth usage: %s', err);
      });

    this.blockchainWriterService
      .download({
        user_eth_address: bucket.ownerPublicKey,
        file_contents_hash: '0x' + object.fileContentsSha256,
        file_name_hash: '0x' + object.fileNameSha256,
        file_size_bytes: params.bandwidthUsed,
        gateway_eth_address: object.gatewayEthAddress,
      })
      .catch((err) => {
        this.logger.error(
          `Error on blockchainWriterService.download: file_name_hash: %s , err: %s`,
          object.fileNameSha256,
          err,
        );
      });
  }

  async checkIfUserCanDownload(publicKey: string): Promise<{ canDownload: boolean }> {
    const canDownload = await this.commonUtils.hasAtLeast1DollarOrCantConnectToBlockchain(publicKey);

    return { canDownload };
  }
}
