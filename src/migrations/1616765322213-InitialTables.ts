import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class InitialTables1616765322213 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    const objectsTable = new Table({
      name: 'objects',
      indices: [
        {
          columnNames: ['key', 'bucket'],
          isUnique: true,
        },
      ],
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'createdAt', type: 'timestamptz', isNullable: false },
        { name: 'modifiedAt', type: 'timestamptz', isNullable: true },
        { name: 'key', type: 'varchar' },
        { name: 'size', type: 'integer', isNullable: true },
        { name: 'bucket', type: 'varchar', isNullable: true },
        { name: 'contentType', type: 'varchar', isNullable: true },
        { name: 'contentMd5', type: 'varchar', isNullable: true },
        { name: 'etag', type: 'varchar', isNullable: true },
      ],
    });
    await queryRunner.createTable(objectsTable);

    const multipartUploadsTable = new Table({
      name: 'multipart_uploads',
      indices: [
        {
          columnNames: ['key', 'bucket'],
        },
      ],
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'createdAt', type: 'timestamptz', isNullable: false },
        { name: 'key', type: 'varchar', isNullable: false },
        { name: 'bucket', type: 'varchar', isNullable: false },
        { name: 'contentDisposition', type: 'varchar', isNullable: true },
        { name: 'contentEncoding', type: 'varchar', isNullable: true },
        { name: 'contentLanguage', type: 'varchar', isNullable: true },
        { name: 'contentType', type: 'varchar', isNullable: true },
      ],
    });
    await queryRunner.createTable(multipartUploadsTable);

    const multipartUploadPartsTable = new Table({
      name: 'multipart_upload_parts',
      indices: [
        {
          columnNames: ['multipartUploadId', 'partNumber'],
          isUnique: true,
        },
      ],
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'createdAt', type: 'timestamptz', isNullable: false },
        { name: 'partNumber', type: 'integer', isNullable: false },
        { name: 'size', type: 'integer', isNullable: true },
        { name: 'bucket', type: 'varchar', isNullable: false },
        { name: 'multipartUploadId', type: 'varchar', isNullable: false },
        { name: 'md5Sum', type: 'varchar', isNullable: true },
      ],
    });
    await queryRunner.createTable(multipartUploadPartsTable);

    const accessKeysTable = new Table({
      name: 'access_keys',
      indices: [{ columnNames: ['bucket'] }],
      columns: [
        { name: 'id', type: 'varchar', isPrimary: true },
        { name: 'createdAt', type: 'timestamptz', isNullable: false },
        { name: 'secretKey', type: 'varchar', isNullable: false },
        { name: 'bucket', type: 'varchar', isNullable: false },
      ],
    });
    await queryRunner.createTable(accessKeysTable);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('objects');
    await queryRunner.dropTable('multipart_uploads');
    await queryRunner.dropTable('multipart_upload_parts');
    await queryRunner.dropTable('access_keys');
  }
}
