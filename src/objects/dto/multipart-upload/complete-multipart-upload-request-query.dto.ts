import { IsString } from 'class-validator';

export class CompleteMultipartUploadRequestQueryDto {
  @IsString()
  uploadId: string;
}
