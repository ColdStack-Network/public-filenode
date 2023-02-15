import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddBucketOwnerPublicKey1628444517989 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'buckets',
      new TableColumn({
        name: 'ownerPublicKey',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'buckets',
      new TableIndex({
        columnNames: ['ownerPublicKey'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('buckets', 'ownerPublicKey');
  }
}
