import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddIndexes1621698707539 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'multipart_upload_parts',
      new TableIndex({
        columnNames: ['multipartUploadId'],
      }),
    );

    await queryRunner.createIndex(
      'multipart_upload_parts',
      new TableIndex({
        columnNames: ['partNumber'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'multipart_upload_parts',
      new TableIndex({
        columnNames: ['multipartUploadId'],
      }),
    );

    await queryRunner.dropIndex(
      'multipart_upload_parts',
      new TableIndex({
        columnNames: ['partNumber'],
      }),
    );
  }
}
