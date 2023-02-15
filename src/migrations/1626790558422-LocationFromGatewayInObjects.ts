import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class LocationFromGatewayInObjects1626790558422 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'locationFromGateway',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'objects',
      new TableIndex({
        columnNames: ['storageForceChosen'],
      }),
    );

    await queryRunner.createIndex(
      'objects',
      new TableIndex({
        columnNames: ['locationFromGateway'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('objects', 'locationFromGateway');

    await queryRunner.dropIndex(
      'objects',
      new TableIndex({
        columnNames: ['storageForceChosen'],
      }),
    );

    await queryRunner.dropIndex(
      'objects',
      new TableIndex({
        columnNames: ['locationFromGateway'],
      }),
    );
  }
}
