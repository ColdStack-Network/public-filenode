import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeGatewayTypeNotNullable1621289678850 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE multipart_uploads ALTER COLUMN "gatewayType" SET NOT NULL;
    `);

    await queryRunner.addColumn(
      'objects',
      new TableColumn({
        name: 'storageForceChosen',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'multipart_uploads',
      new TableColumn({
        name: 'storageForceChosen',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE multipart_uploads ALTER COLUMN "gatewayType" DROP NOT NULL;
    `);
    await queryRunner.dropColumn('objects', 'storageForceChosen');
    await queryRunner.dropColumn('multipart_uploads', 'storageForceChosen');
  }
}
