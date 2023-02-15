import { Type } from 'class-transformer';
import { Equals, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class ListObjectsV2RequestQueryDto {
  @Equals('2')
  @IsOptional()
  'list-type'?: '2';

  @IsString()
  @IsOptional()
  'continuation-token'?: string;

  @IsString()
  @IsOptional()
  'delimiter'?: string;

  @Equals('url')
  @IsOptional()
  'encoding-type'?: 'url';

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  'max-keys'?: number;

  @IsString()
  @IsOptional()
  'prefix'?: string;

  @IsString()
  @IsOptional()
  'start-after'?: string;
}
