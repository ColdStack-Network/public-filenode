import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddColumnsAboutGateway1618941173511 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'gateway',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'gatewayHash',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('objects', 'gateway');
    await queryRunner.dropColumn('objects', 'gatewayHash');
  }
}
