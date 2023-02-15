import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { DownloaderServiceHelperService } from './downloader-service-helper.service';
import { BandwidthUsageReportByDownloaderServiceDto } from './dto/BandwidthUsageReportByDownloaderService.dto';

@Controller()
export class AppController {
  private register: Registry;
  constructor(private readonly service: DownloaderServiceHelperService) {
    this.register = new Registry();
    collectDefaultMetrics({ register: this.register });
  }

  @Get('__internal/health')
  async getHealthInfo(): Promise<any> {
    return await this.register.metrics();
  }

  @Get('__internal/object-with-metadatas-and-buckets')
  async getObjectWithMetadatasAndBucket(@Query('bucket') bucket: string, @Query('key') key: string): Promise<any> {
    return this.service.getObjectWithMetadatasAndBucketAndGateway(bucket, key);
  }

  @Get('__internal/buckets-by-owner-public-key/:publicKey')
  async getBucketsByOwnerPublicKey(@Param('publicKey') publicKey: string): Promise<any> {
    return this.service.getBucketsByOwnerPublicKey(publicKey);
  }

  @Post('__internal/bandwidth-usage-report')
  async reportBandwidthUsage(@Body() body: BandwidthUsageReportByDownloaderServiceDto): Promise<any> {
    return this.service.reportBandwidthUsage(body);
  }

  @Get('__internal/check-if-user-can-download')
  async checkIfUserCanDownload(@Query('publicKey') publicKey: string): Promise<{ canDownload: boolean }> {
    return this.service.checkIfUserCanDownload(publicKey);
  }
}
