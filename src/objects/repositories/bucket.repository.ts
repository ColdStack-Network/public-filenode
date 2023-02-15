import { EntityRepository, Repository } from 'typeorm';
import { BucketEntity } from '../entities/bucket.entity';

@EntityRepository(BucketEntity)
export class BucketRepository extends Repository<BucketEntity> {
  getByAccessKeyId(accessKeyId: string): Promise<BucketEntity[]> {
    return this.find({
      where: {
        accessKeyId,
      },
    });
  }

  findByNameOrFail(name: string): Promise<BucketEntity> {
    return this.findOneOrFail({
      where: {
        name,
      },
    });
  }

  getByOwnerPublicKey(ownerPublicKey: string, params?: { take?: number; skip?: number }): Promise<BucketEntity[]> {
    return this.find({
      where: {
        ownerPublicKey,
      },
      ...(params || {}),
      order: {
        name: 'ASC',
      },
    });
  }

  async bucketExists(bucketName: string): Promise<boolean> {
    return !!(await this.count({
      where: {
        name: bucketName,
      },
    }));
  }

  getBucketsCountForUser(ownerPublicKey: string): Promise<number> {
    return this.count({
      where: {
        ownerPublicKey,
      },
    });
  }
}
