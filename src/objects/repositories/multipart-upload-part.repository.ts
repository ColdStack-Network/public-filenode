import { EntityRepository, Repository } from 'typeorm';
import { MultipartUploadPartEntity } from '../entities/multipart-upload-part.entity';

@EntityRepository(MultipartUploadPartEntity)
export class MultipartUploadPartRepository extends Repository<MultipartUploadPartEntity> {
  findByMultipartUploadIdAndPartNumber(
    multipartUploadId: string,
    partNumber: number,
  ): Promise<MultipartUploadPartEntity> {
    return this.findOne({
      where: {
        multipartUploadId,
        partNumber,
      },
    });
  }

  findByMultipartUploadIdSortByPartNumber(multipartUploadId: string): Promise<MultipartUploadPartEntity[]> {
    return this.find({
      where: {
        multipartUploadId,
      },
      order: {
        partNumber: 'ASC',
      },
    });
  }
}
