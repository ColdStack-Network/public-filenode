import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class UploadPartRequestHeadersDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  'content-length'?: number;

  @IsString()
  @IsOptional()
  'content-md5'?: string;
}
