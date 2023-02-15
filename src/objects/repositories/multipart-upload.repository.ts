import { EntityRepository, Repository } from 'typeorm';
import { MultipartUploadEntity } from '../entities/multipart-upload.entity';

@EntityRepository(MultipartUploadEntity)
export class MultipartUploadRepository extends Repository<MultipartUploadEntity> {
  findByKeyAndBucket(key: string, bucket: string): Promise<MultipartUploadEntity> {
    return this.findOne({
      where: {
        key,
        bucket,
      },
    });
  }
  findByKeyAndBucketAndId(params: { id: string; bucket: string; key: string }): Promise<MultipartUploadEntity> {
    return this.findOne({
      where: {
        id: params.id,
        bucket: params.bucket,
        key: params.key,
      },
    });
  }

  async getMultipartUploadsByKeysAndIdsAndBucketOrderedByKeys(
    bucket: string,
    keysAndIds: { key: string; id: string }[],
  ): Promise<MultipartUploadEntity[]> {
    if (!keysAndIds.length) {
      return Promise.resolve([]);
    }

    let whereSql = '';
    const params: Record<string, string> = {};

    keysAndIds.forEach((keyAndId, i) => {
      whereSql += `(multipart_uploads.key = :key_${i} AND multipart_uploads.id = :id_${i})`;

      params[`key_${i}`] = keyAndId.key;
      params[`id_${i}`] = keyAndId.id;

      if (i < keysAndIds.length - 1) {
        whereSql += ` OR `;
      }
    });

    const multipartUploads = await this.createQueryBuilder('multipart_uploads')
      .where('multipart_uploads.bucket = :bucket', {
        bucket,
      })
      .andWhere(`(${whereSql})`, params)
      .getMany();

    return multipartUploads;
  }
}
