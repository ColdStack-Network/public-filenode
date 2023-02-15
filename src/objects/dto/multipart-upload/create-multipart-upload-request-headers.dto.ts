import { IsOptional, IsString } from 'class-validator';

export class CreateMultipartUploadRequestHeadersDto {
  @IsString()
  @IsOptional()
  'cache-control'?: string;

  @IsString()
  @IsOptional()
  'content-disposition'?: string;

  @IsString()
  @IsOptional()
  'content-encoding'?: string;

  @IsString()
  @IsOptional()
  'content-language'?: string;

  @IsString()
  @IsOptional()
  'content-type'?: string;

  @IsString()
  @IsOptional()
  'expires'?: string;
}
