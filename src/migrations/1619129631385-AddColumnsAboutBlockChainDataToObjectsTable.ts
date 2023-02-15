import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddColumnsAboutBlockChainDataToObjectsTable1619129631385 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('objects', [
      new TableColumn({ name: 'bucketNameSha256', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'fileContentsSha256', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'fileNameSha256', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'gatewayEthAddress', type: 'varchar', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('objects', 'bucketNameSha256');
    await queryRunner.dropColumn('objects', 'fileContentsSha256');
    await queryRunner.dropColumn('objects', 'fileNameSha256');
    await queryRunner.dropColumn('objects', 'gatewayEthAddress');
  }
}
