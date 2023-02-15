import { EntityRepository, In, Repository } from 'typeorm';
import { ObjectEntity } from '../entities/object.entity';

@EntityRepository(ObjectEntity)
export class ObjectRepository extends Repository<ObjectEntity> {
  async getOverallObjectsCountInBuckets(buckets: string[], excludeFolders = false): Promise<number> {
    if (!buckets.length) {
      return 0;
    }

    const qb = this.createQueryBuilder('object').where('object.bucket in (:...buckets)', { buckets });
    if (excludeFolders) {
      qb.andWhere(`object.type = 'file'`);
    }
    return await qb.getCount();
  }

  async getObjectsSizeSumInObjects(buckets: string[]): Promise<string> {
    if (!buckets.length) {
      return '0';
    }

    const resultFromDb: { sum: string } = await this.createQueryBuilder('objects')
      .select('sum(size)')
      .where('bucket IN (:...buckets)', { buckets })
      .getRawOne();

    return resultFromDb.sum;
  }

  async countObjectsForBuckets(buckets: string[]): Promise<{ [bucket: string]: number }> {
    if (!buckets.length) {
      return {};
    }

    const resultFromDb: { bucket; count }[] = await this.createQueryBuilder('objects')
      .select('bucket, count(*)')
      .where('bucket IN (:...buckets)', { buckets })
      .groupBy('bucket')
      .getRawMany();

    const result: { [bucket: string]: number } = {};

    resultFromDb.forEach(({ bucket, count }) => {
      result[bucket] = count;
    });

    return result;
  }

  async countObjectsWithoutFoldersForBuckets(buckets: string[]): Promise<{ [bucket: string]: number }> {
    if (!buckets.length) {
      return {};
    }

    const resultFromDb: { bucket; count }[] = await this.createQueryBuilder('objects')
      .select('bucket, count(*)')
      .where('bucket IN (:...buckets)', { buckets })
      .andWhere(`NOT (key LIKE '%/')`)
      .andWhere('NOT (size = 0)')
      .groupBy('bucket')
      .getRawMany();

    const result: { [bucket: string]: number } = {};

    resultFromDb.forEach(({ bucket, count }) => {
      result[bucket] = count;
    });

    return result;
  }

  async getBucketSize(bucket: string): Promise<string> {
    const resultFromDb: { size: string } = await this.createQueryBuilder('objects')
      .select('sum(size) as size')
      .where('bucket = :bucket', { bucket })
      .getRawOne();

    return resultFromDb.size;
  }

  findByKeyAndBucket(key: string, bucket: string): Promise<ObjectEntity> {
    return this.findOne({
      where: {
        key,
        bucket,
      },
    });
  }

  findByKeyAndBucketAndJoinMetadatas(key: string, bucket: string): Promise<ObjectEntity> {
    return this.findOne({
      where: {
        key,
        bucket,
      },
      relations: ['metadatas'],
    });
  }

  async getObjectsByKeysAndBucketOrderedByKeys(bucket: string, keys: string[]): Promise<ObjectEntity[]> {
    return this.find({
      where: {
        key: In(keys),
        bucket,
      },
      order: {
        key: 'ASC',
      },
    });
  }

  async updateBucketName(oldBucketName: string, newBucketName: string): Promise<void> {
    await this.update(
      {
        bucket: oldBucketName,
      },
      {
        bucket: newBucketName,
      },
    );
  }

  async getSizeAndLastModifiedForCommonPrefixes(
    bucket: string,
    commonPrefixes: string[],
  ): Promise<{ [commonPrefix: string]: { size: string; modifiedAt: Date } }> {
    if (!commonPrefixes.length) {
      return {};
    }

    const result: { [commonPrefix: string]: { size: string; modifiedAt: Date } } = {};

    await Promise.all(
      commonPrefixes.map(async (commonPrefix) => {
        const commonPrefixInfo: { modifiedAt: Date; size: string } = await this.createQueryBuilder('objects')
          .select('MAX(objects."modifiedAt") as "modifiedAt", SUM(size) as size')
          .where('objects.bucket = :bucket', { bucket })
          .andWhere('objects.key LIKE :pattern', { pattern: `${this.escapeForPostgresLikeOperation(commonPrefix)}%` })
          .getRawOne();

        result[commonPrefix] = commonPrefixInfo;
      }),
    );

    return result;
  }

  escapeForPostgresLikeOperation(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/\_/g, '\\_').replace(/%/g, '\\%');
  }
}
