import { MigrationInterface, QueryRunner } from 'typeorm';

export class BucketOwnerPublicKeyNotNullAndObjectsACL1628449146317 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE buckets ALTER COLUMN "ownerPublicKey" SET NOT NULL;');
    await queryRunner.query('ALTER TABLE buckets DROP COLUMN "accessKeyId";');
    await queryRunner.query(`
      ALTER TABLE objects ADD COLUMN "acl" VARCHAR;
      UPDATE objects SET acl = 'private';
      ALTER TABLE objects ALTER COLUMN acl SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE buckets ALTER COLUMN "ownerPublicKey" DROP NOT NULL;');
    await queryRunner.query('ALTER TABLE buckets ADD COLUMN "accessKeyId" varchar;');
    await queryRunner.query('ALTER TABLE objects DROP COLUMN "acl";');
  }
}
