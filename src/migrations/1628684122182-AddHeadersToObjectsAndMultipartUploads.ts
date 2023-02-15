import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHeadersToObjectsAndMultipartUploads1628684122182 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE objects ADD COLUMN headers jsonb;
      ALTER TABLE multipart_uploads ADD COLUMN headers jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE objects DROP COLUMN headers;
      ALTER TABLE multipart_uploads DROP COLUMN headers;
    `);
  }
}
