import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsString } from 'class-validator';

export class UploadPartRequestQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  partNumber: number;

  @IsString()
  uploadId: string;
}
