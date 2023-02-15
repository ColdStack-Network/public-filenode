/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 * Not all headers supported by Amazon S3 included here. Only those
 * that we will support at the first stage.
 */
export class GetObjectRequestQueryDto {
  'response-cache-control'?: string;
  'response-content-disposition'?: string;
  'response-content-encoding'?: string;
  'response-content-language'?: string;
  'response-content-type'?: string;
  'response-expires'?: string;
}
