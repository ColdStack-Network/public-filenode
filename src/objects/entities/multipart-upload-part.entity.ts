import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'multipart_upload_parts' })
@Index(['multipartUploadId', 'partNumber'], { unique: true })
export class MultipartUploadPartEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'int' })
  partNumber: number;

  /**
   * Size of the file in bytes
   */
  @Column({ type: 'int', nullable: true })
  size: number;

  /**
   * User id
   */
  @Column({ type: 'varchar' })
  bucket: string;

  @Column({ type: 'varchar' })
  multipartUploadId: string;

  @Column({ type: 'varchar', nullable: true })
  md5Sum: string;
}
