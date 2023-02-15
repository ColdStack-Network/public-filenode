import { MigrationInterface, QueryRunner } from 'typeorm';

export class BandwidthUsage1628804944312 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bandwidth_usage (
        id uuid,
        "createdAt" timestamptz NOT NULL,
        size integer NOT NULL,
        type varchar NOT NULL,
        bucket varchar,
        info jsonb,
        PRIMARY KEY (id)
      );

      CREATE INDEX "IX_bandwidth_usage__createdAt" ON bandwidth_usage ("createdAt");
      CREATE INDEX "IX_bandwidth_usage__bucket" ON bandwidth_usage ("bucket");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bandwidth_usage;');
  }
}
