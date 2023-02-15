import moment from 'moment';
import { EntityRepository, Repository } from 'typeorm';
import { StorageUsageEntity } from '../entities/storage-usage.entity';

@EntityRepository(StorageUsageEntity)
export class StorageUsageRepository extends Repository<StorageUsageEntity> {
  async aggregateStorageUsageAnalyticsForUser(params: {
    userPublicKey: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<{ sizeSum: string; createdAt: Date }[]> {
    const storageUsageByBuckets = this.createQueryBuilder('storage_usage')
      .select(
        'MAX(storage_usage.size) as "sizeSum", to_char(storage_usage."createdAt", \'YYYY-MM-DD\') as "createdAt", storage_usage."bucket"',
      )
      .where('storage_usage."userPublicKey" = :userPublicKey', {
        userPublicKey: params.userPublicKey.toLowerCase(),
      });

    if (params.fromDate && moment(params.fromDate).isValid()) {
      storageUsageByBuckets.andWhere('storage_usage."createdAt" >= :fromDate', { fromDate: params.fromDate });
    }

    if (params.toDate && moment(params.toDate).isValid()) {
      storageUsageByBuckets.andWhere('storage_usage."createdAt" < :toDate', { toDate: params.toDate });
    }

    storageUsageByBuckets.groupBy('storage_usage."createdAt"').addGroupBy('bucket');

    const storageUsage: { sizeSum: string; createdAt: Date }[] = await this.manager.connection
      .createQueryBuilder()
      .select('SUM(storage_usage_by_buckets."sizeSum") AS "sizeSum", storage_usage_by_buckets."createdAt"')
      .from('(' + storageUsageByBuckets.getQuery() + ')', 'storage_usage_by_buckets')
      .setParameters(storageUsageByBuckets.getParameters())
      .groupBy('storage_usage_by_buckets."createdAt"')
      .orderBy('storage_usage_by_buckets."createdAt"', 'ASC')
      .getRawMany();

    return storageUsage;
  }
}
