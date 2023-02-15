import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMultipartUploadStatusAndRemoveBucketHash1627605021285 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'status',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.dropColumn('objects', 'bucketNameSha256');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('multipart_uploads', 'status');

    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'bucketNameSha256',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }
}
