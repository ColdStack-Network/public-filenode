import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGatewayAddressToObjects1624834982589 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'gatewayAddress',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'gatewayAddress',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('objects', 'gatewayAddress');
    await queryRunner.dropColumn('multipart_uploads', 'gatewayAddress');
  }
}
