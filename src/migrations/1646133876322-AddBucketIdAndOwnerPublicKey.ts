import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBucketIdAndOwnerPublicKey1646133876322 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bandwidth_usage ADD COLUMN "bucketId" varchar;
      ALTER TABLE bandwidth_usage ADD COLUMN "userPublicKey" varchar;

      UPDATE bandwidth_usage
      SET
        "bucketId" = buckets.id,
        "userPublicKey" = buckets."ownerPublicKey"
      FROM buckets
      WHERE bandwidth_usage.bucket = buckets.name;

      DELETE FROM bandwidth_usage WHERE "bucketId" IS NULL OR "userPublicKey" IS NULL;

      ALTER TABLE bandwidth_usage DROP COLUMN "bucket";
      ALTER TABLE bandwidth_usage ALTER COLUMN "bucketId" SET NOT NULL;
      ALTER TABLE bandwidth_usage ALTER COLUMN "userPublicKey" SET NOT NULL;


      ALTER TABLE storage_usage ADD COLUMN "bucketId" varchar;
      ALTER TABLE storage_usage ADD COLUMN "userPublicKey" varchar;
      
      UPDATE storage_usage
      SET
        "bucketId" = buckets.id,
        "userPublicKey" = buckets."ownerPublicKey"
      FROM buckets
      WHERE storage_usage.bucket = buckets.name;

      DELETE FROM storage_usage WHERE "bucketId" IS NULL OR "userPublicKey" IS NULL;

      ALTER TABLE storage_usage DROP COLUMN "bucket";
      ALTER TABLE storage_usage ALTER COLUMN "bucketId" SET NOT NULL;
      ALTER TABLE storage_usage ALTER COLUMN "userPublicKey" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bandwidth_usage ADD COLUMN "bucket" varchar;

      UPDATE bandwidth_usage
      SET
        "bucket" = buckets.name
      FROM buckets
      WHERE bandwidth_usage."bucketId" = buckets.id;

      ALTER TABLE bandwidth_usage DROP COLUMN "bucketId";
      ALTER TABLE bandwidth_usage DROP COLUMN "userPublicKey";


      ALTER TABLE storage_usage ADD COLUMN "bucket" varchar;

      UPDATE storage_usage
      SET
        "bucket" = buckets.name
      FROM buckets
      WHERE storage_usage."bucketId" = buckets.id;

      ALTER TABLE storage_usage DROP COLUMN "bucketId";
      ALTER TABLE storage_usage DROP COLUMN "userPublicKey";
    `);
  }
}
