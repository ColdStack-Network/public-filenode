import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisableStatusUpdates1645533556603 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE objects ADD COLUMN "disableStatusUpdates" boolean DEFAULT FALSE NOT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE objects DROP COLUMN "disableStatusUpdates";`);
  }
}
