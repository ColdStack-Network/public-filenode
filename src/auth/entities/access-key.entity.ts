import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'access_keys' })
export class AccessKeyEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'varchar' })
  secretKey: string;
}
