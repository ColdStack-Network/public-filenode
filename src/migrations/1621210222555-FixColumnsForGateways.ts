import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class FixColumnsForGateways1621210222555 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'gatewayEthAddress',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'gatewayType',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.renameColumn('objects', 'gateway', 'gatewayType');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('multipart_uploads', 'gatewayEthAddress');
    await queryRunner.dropColumn('multipart_uploads', 'gatewayType');

    await queryRunner.renameColumn('objects', 'gatewayType', 'gateway');
  }
}
