import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddACLToMultipartUploads1628502517164 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE multipart_uploads ADD COLUMN "acl" VARCHAR;
      UPDATE multipart_uploads SET acl = 'private';
      ALTER TABLE multipart_uploads ALTER COLUMN acl SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE multipart_uploads DROP COLUMN "acl";');
  }
}
