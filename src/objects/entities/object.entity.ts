import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { GatewayType } from '../../gateways/gateway-type.enum';
import { StorageClass } from '../constants/storage-class.enum';
import { ObjectMetadataEntity } from './object-metadata.entity';

@Entity({ name: 'objects' })
@Index(['key', 'bucket'], { unique: true })
export class ObjectEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'timestamptz', nullable: false })
  modifiedAt: Date;

  /**
   * Note the collation C.UTF-8
   */
  @Column({ type: 'varchar', collation: 'C.UTF-8' })
  key: string;

  /**
   * Size of the file in bytes
   */
  @Column({ type: 'bigint' })
  size: string;

  /**
   * User id
   */
  @Column({ type: 'varchar' })
  bucket: string;

  @Column({ type: 'varchar' })
  contentType?: string;

  @Column({ type: 'jsonb', nullable: true })
  headers?: {
    'Cache-Control'?: string;
    'Content-Disposition'?: string;
    'Content-Encoding'?: string;
    'Content-Language'?: string;
    'Content-Type'?: string;
    Expires?: string;
  };

  @Column({ type: 'varchar', nullable: true })
  contentMd5?: string;

  @Column({ type: 'varchar' })
  etag: string;

  @Column({ type: 'varchar', nullable: true })
  fileContentsSha256?: string;

  @Column({ type: 'varchar', nullable: true })
  fileNameSha256?: string;

  @Column({ type: 'varchar', nullable: true })
  gatewayEthAddress?: string;

  @Column({ type: 'boolean', nullable: true })
  storageForceChosen: boolean;

  @Column({ type: 'varchar', nullable: true })
  locationFromGateway: string;

  @Column({ type: 'varchar', nullable: false })
  gatewayType: GatewayType;

  @Column({ type: 'varchar', nullable: true })
  gatewayAddress?: string;

  @Column({ type: 'varchar', nullable: true })
  gatewayHash?: string;

  @Column({ type: 'varchar', nullable: false })
  acl: 'public-read' | 'private';

  @Column({ type: 'varchar', nullable: false })
  storageClass: StorageClass;

  @OneToMany(() => ObjectMetadataEntity, (metadata) => metadata.object)
  metadatas?: ObjectMetadataEntity[];

  @Column({ type: 'enum', enum: ['file', 'folder'], nullable: false })
  type: 'file' | 'folder';

  @Column({ type: 'varchar', nullable: false })
  filename: string;
}
