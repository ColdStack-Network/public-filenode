import { IsDate, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 * Not all headers supported by Amazon S3 included here. Only those
 * that we will support at the first stage.
 */
export class GetObjectRequestHeadersDto {
  @IsString()
  @IsOptional()
  'if-match'?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  'if-modified-since'?: Date;

  @IsString()
  @IsOptional()
  'if-none-match'?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  'if-unmodified-since'?: Date;
}
