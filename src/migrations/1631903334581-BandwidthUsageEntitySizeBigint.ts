import { MigrationInterface, QueryRunner } from 'typeorm';

export class BandwidthUsageEntitySizeBigint1631903334581 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE bandwidth_usage ALTER COLUMN size TYPE bigint;');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE bandwidth_usage ALTER COLUMN size TYPE integer;');
  }
}
