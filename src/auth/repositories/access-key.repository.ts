import { EntityRepository, Repository } from 'typeorm';
import { AccessKeyEntity } from '../entities/access-key.entity';

@EntityRepository(AccessKeyEntity)
export class AccessKeyRepository extends Repository<AccessKeyEntity> {
  findOneWithBuckets(id: string): Promise<AccessKeyEntity> {
    return this.findOne({
      where: {
        id,
      },
      relations: ['buckets'],
    });
  }
}
