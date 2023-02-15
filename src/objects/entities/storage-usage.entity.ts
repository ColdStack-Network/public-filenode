import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'storage_usage' })
export class StorageUsageEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'timestamptz', nullable: false })
  createdAt: Date;

  @Column({ type: 'bigint', nullable: false })
  size: string;

  @Column({ type: 'varchar', nullable: false })
  bucketId: string;

  @Column({ type: 'varchar', nullable: false })
  userPublicKey: string;
}
