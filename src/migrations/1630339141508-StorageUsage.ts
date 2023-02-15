import { MigrationInterface, QueryRunner } from 'typeorm';

export class StorageUsage1630339141508 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE storage_usage (
        id uuid,
        "createdAt" timestamptz NOT NULL,
        size integer NOT NULL,
        bucket varchar,
        PRIMARY KEY (id)
      );

      CREATE INDEX "IX_storage_usage__createdAt" ON storage_usage ("createdAt");
      CREATE INDEX "IX_storage_usage__bucket" ON storage_usage ("bucket");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE storage_usage;');
  }
}
