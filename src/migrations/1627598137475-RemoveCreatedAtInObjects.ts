import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveCreatedAtInObjects1627598137475 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('UPDATE objects SET "modifiedAt" = "createdAt" WHERE "modifiedAt" IS NULL;');
    await queryRunner.dropColumn('objects', 'createdAt');
    await queryRunner.query('ALTER TABLE objects ALTER COLUMN "modifiedAt" SET NOT NULL;');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    queryRunner.addColumn('objects', new TableColumn({ name: 'createdAt', type: 'timestamptz', isNullable: true }));
    await queryRunner.query('UPDATE objects SET "createdAt" = "modifiedAt";');
    await queryRunner.query('ALTER TABLE objects ALTER COLUMN "createdAt" SET NOT NULL;');
    await queryRunner.query('ALTER TABLE objects ALTER COLUMN "modifiedAt" SET NULL;');
  }
}
