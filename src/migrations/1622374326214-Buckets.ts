import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Buckets1622374326214 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'buckets',
      indices: [{ columnNames: ['name'], isUnique: true }, { columnNames: ['accessKeyId'] }],
      columns: [
        {
          name: 'id',
          type: 'varchar',
          isPrimary: true,
        },
        { name: 'createdAt', type: 'timestamptz', isNullable: false },
        { name: 'name', type: 'varchar', isNullable: false },
        { name: 'accessKeyId', type: 'varchar', isNullable: false },
      ],
    });

    await queryRunner.createTable(table);

    await queryRunner.query(`
        INSERT INTO "buckets"
        ( id, "createdAt", name, "accessKeyId" )
        ( SELECT DISTINCT ON (bucket) uuid_generate_v4()::varchar AS id, "createdAt", bucket AS name, id AS "accessKeyId" from access_keys ORDER BY bucket, "createdAt" ASC );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('buckets');
  }
}
