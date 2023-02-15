import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AdddGatewayMultipartUploadId1619817624721 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'gatewayMultipartUploadId',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('multipart_uploads', 'gatewayMultipartUploadId');
  }
}
