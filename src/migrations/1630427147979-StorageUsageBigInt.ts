import { MigrationInterface, QueryRunner } from 'typeorm';

export class StorageUsageBigInt1630427147979 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE storage_usage ALTER COLUMN size TYPE bigint;');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE storage_usage ALTER COLUMN size TYPE integer;');
  }
}
