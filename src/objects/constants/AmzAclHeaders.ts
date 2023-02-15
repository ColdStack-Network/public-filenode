/**
 * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html#API_PutObject_RequestSyntax
 */
export enum AmzAclHeader {
  'private' = 'private',
  'public-read' = 'public-read',
  'public-read-write' = 'public-read-write',
  'authenticated-read' = 'authenticated-read',
  'aws-exec-read' = 'aws-exec-read',
  'bucket-owner-read' = 'bucket-owner-read',
  'bucket-owner-full-control' = 'bucket-owner-full-control',
}
