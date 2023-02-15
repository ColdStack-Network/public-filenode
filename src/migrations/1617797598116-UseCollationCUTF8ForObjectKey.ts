import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseCollationCUTF8ForObjectKey1617797598116 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE objects ALTER COLUMN key TYPE character varying COLLATE "C.UTF-8";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE objects ALTER COLUMN key TYPE character varying COLLATE "default";
    `);
  }
}
