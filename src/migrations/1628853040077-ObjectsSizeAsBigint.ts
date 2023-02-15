import { MigrationInterface, QueryRunner } from 'typeorm';

export class ObjectsSizeAsBigint1628853040077 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE objects ALTER COLUMN size TYPE bigint;');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE objects ALTER COLUMN size TYPE integer;');
  }
}
