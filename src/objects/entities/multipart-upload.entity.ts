import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { GatewayType } from '../../gateways/gateway-type.enum';
import { StorageClass } from '../constants/storage-class.enum';

@Entity({ name: 'multipart_uploads' })
@Index(['key', 'bucket'])
export class MultipartUploadEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  headers?: {
    'Cache-Control'?: string;
    'Content-Disposition'?: string;
    'Content-Encoding'?: string;
    'Content-Language'?: string;
    'Content-Type'?: string;
    Expires?: string;
  };

  /**
   * Note the collation C.UTF-8
   */
  @Column({ type: 'varchar', collation: 'C.UTF-8' })
  key: string;

  /**
   * User id
   */
  @Column({ type: 'varchar' })
  bucket: string;

  @Column({ type: 'varchar', nullable: true })
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED';

  @Column({ type: 'varchar', nullable: true })
  contentDisposition?: string;

  @Column({ type: 'varchar', nullable: true })
  contentEncoding?: string;

  @Column({ type: 'varchar', nullable: true })
  contentLanguage?: string;

  @Column({ type: 'varchar', nullable: true })
  contentType?: string;

  @Column({ type: 'varchar', nullable: true })
  gatewayEthAddress?: string;

  @Column({ type: 'varchar', nullable: true })
  gatewayAddress?: string;

  @Column({ type: 'boolean', nullable: true })
  storageForceChosen: boolean;

  @Column({ type: 'varchar', nullable: false })
  gatewayType: GatewayType;

  @Column({ type: 'varchar', nullable: true })
  gatewayMultipartUploadId?: string;

  @Column({ type: 'jsonb', nullable: true })
  objectMetadata?: Record<string, string>;

  @Column({ type: 'varchar', nullable: false })
  acl: 'public-read' | 'private';

  @Column({ type: 'varchar', nullable: false })
  storageClass: StorageClass;
}
