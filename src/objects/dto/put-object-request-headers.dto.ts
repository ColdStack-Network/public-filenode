import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AmzAclHeader } from '../constants/AmzAclHeaders';

/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html#API_PutObject_RequestSyntax
 * Not all headers supported by Amazon S3 included here. Only those
 * that we will support at the first stage.
 *
 * TODO: remoce dtos
 */
export class PutObjectRequestHeadersDto {
  @IsEnum(AmzAclHeader)
  @IsOptional()
  'x-amz-acl'?: AmzAclHeader;

  @IsString()
  @IsOptional()
  'content-type'?: string;

  /**
   * We only support STANDARD storage class
   */
  @IsOptional()
  'x-amz-storage-class': string;
}
