import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeletedObjects1632739297056 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE deleted_objects (
        id uuid,
        "deletedAt" timestamptz NOT NULL,
        bucket varchar NOT NULL,
        key varchar NOT NULL,
        object jsonb,
        PRIMARY KEY (id)
      );

      CREATE INDEX "IX_deleted_objects__key" ON deleted_objects ("key");
      CREATE INDEX "IX_deleted_objects__bucket" ON deleted_objects ("bucket");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE deleted_objects;`);
  }
}
