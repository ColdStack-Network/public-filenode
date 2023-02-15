import { Column, CreateDateColumn, DeepPartial, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ObjectEntity } from './object.entity';

@Entity('object_metadatas')
export class ObjectMetadataEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', nullable: false })
  objectId: string;

  @Column({ type: 'varchar', nullable: false })
  key: string;

  @Column({ type: 'varchar', nullable: false })
  value: string;

  @ManyToOne(() => ObjectEntity, (object) => object.metadatas)
  @JoinColumn({ name: 'objectId' })
  object?: ObjectEntity;

  constructor(data: DeepPartial<ObjectMetadataEntity>) {
    Object.assign(this, data);
  }
}
