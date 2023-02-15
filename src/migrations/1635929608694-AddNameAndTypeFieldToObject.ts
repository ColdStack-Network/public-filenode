import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddNameAndTypeFieldToObject1635929608694 implements MigrationInterface {
  name = 'AddNameAndTypeFieldToObject1635929608694';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'filename',
        type: 'varchar',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'type',
        type: 'enum',
        enum: ['file', 'folder'],
        isNullable: true,
      }),
    );

    // Все что ниже делается можно делать этим скриптом. Можно их использовать если база медленно работает со скриптом.
    // UPDATE objects SET filename = substring(key , '[^/]+$'), type='file' WHERE right(key, 1) <> '/';
    // UPDATE objects SET filename = substring(key , '[^/]+/$'), type='folder' WHERE right(key, 1) = '/';
    const [{ count }] = await queryRunner.query(`SELECT COUNT(*) FROM objects`);
    for (let i = 0; i < ~~(count / 100) + 1; i++) {
      const params = [i * 100 + 100, i * 100];

      const oldData = await queryRunner.query(`SELECT * FROM objects ORDER BY id LIMIT $1 OFFSET $2`, params);

      await Promise.all(
        oldData.map(async (element) => {
          const dashIndex = element.key.lastIndexOf('/');
          if (dashIndex === -1) {
            return await queryRunner.query(`UPDATE objects SET filename=$1, type='file' WHERE id=$2`, [
              element.key,
              element.id,
            ]);
          } else if (dashIndex !== element.key.length - 1)
            return await queryRunner.query(`UPDATE objects SET filename=$1, type='file' WHERE id=$2`, [
              element.key.substr(dashIndex + 1),
              element.id,
            ]);
          else if (dashIndex === element.key.length - 1) {
            const preLastDashIndex = element.key.substr(0, dashIndex).lastIndexOf('/');
            return await queryRunner.query(`UPDATE objects SET filename=$1, type='folder' WHERE id=$2`, [
              element.key.substr(preLastDashIndex + 1),
              element.id,
            ]);
          }
        }),
      );
    }

    console.log(await queryRunner.query('SELECT id FROM objects WHERE filename IS NULL;'));

    await queryRunner.createIndex(
      'objects',
      new TableIndex({ columnNames: ['filename'], isUnique: false, name: 'objects_name_indx' }),
    );
    await queryRunner.query(`
      ALTER TABLE objects ALTER COLUMN type SET NOT NULL;
      ALTER TABLE objects ALTER COLUMN filename SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('objects', 'objects_name_indx');
    await queryRunner.dropColumn('objects', 'type');
    await queryRunner.dropColumn('objects', 'filename');
  }
}
