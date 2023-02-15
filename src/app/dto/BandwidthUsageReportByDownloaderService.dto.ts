import { IsOptional, IsString } from 'class-validator';

export class BandwidthUsageReportByDownloaderServiceDto {
  @IsString()
  fileHash: string;

  @IsString()
  bandwidthUsed: string;

  @IsString()
  @IsOptional()
  err: string;

  @IsString()
  @IsOptional()
  gatewayAddress: string;
}
