import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddObjectMetadatas1619971563522 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const objectMetadatasTable = new Table({
      name: 'object_metadatas',
      indices: [
        { columnNames: ['objectId'] },
        {
          columnNames: ['objectId', 'key'],
          isUnique: true,
        },
      ],
      columns: [
        {
          name: 'id',
          type: 'int',
          isPrimary: true,
          isGenerated: true,
        },
        {
          name: 'createdAt',
          type: 'timestamptz',
          isNullable: false,
        },
        {
          name: 'objectId',
          type: 'varchar',
          isNullable: false,
        },
        {
          name: 'key',
          type: 'varchar',
          isNullable: false,
        },
        {
          name: 'value',
          type: 'varchar',
          isNullable: false,
        },
      ],
    });

    await queryRunner.createTable(objectMetadatasTable);

    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'objectMetadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('object_metadatas');
    await queryRunner.dropColumn('multipart_uploads', 'objectMetadata');
  }
}
