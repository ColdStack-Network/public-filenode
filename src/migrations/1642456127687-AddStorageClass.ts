import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageClass1642456127687 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE objects ADD COLUMN "storageClass" varchar;
        UPDATE objects SET "storageClass" = 'STANDARD';
        ALTER TABLE objects ALTER COLUMN "storageClass" SET NOT NULL;

        ALTER TABLE multipart_uploads ADD COLUMN "storageClass" varchar;
        UPDATE multipart_uploads SET "storageClass" = 'STANDARD';
        ALTER TABLE multipart_uploads ALTER COLUMN "storageClass" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE objects DROP COLUMN "storageClass";');
    await queryRunner.query('ALTER TABLE multipart_uploads DROP COLUMN "storageClass";');
  }
}
