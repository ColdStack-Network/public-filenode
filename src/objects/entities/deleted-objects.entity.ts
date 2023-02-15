import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ObjectEntity } from './object.entity';

@Entity({ name: 'deleted_objects' })
export class DeletedObjectEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'timestamptz' })
  deletedAt: Date;

  @Column({ type: 'varchar', nullable: false })
  bucket: string;

  @Column({ type: 'varchar', nullable: false })
  key: string;

  @Column({ type: 'jsonb', nullable: false })
  object: ObjectEntity;
}
