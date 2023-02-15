import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlockchainWriterProps1627045062699 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      /*
        Blockchain writer is a process that picks transactions from
        blockchain_transactions table, submit them eventually to blockchain and
        update their status after they eventually included in blockchain.
        This table is intended to have single row.
      */
      create table blockchain_writer_props (
        /*
          Nonce counter. Every transaction has a nonce field. Nonces should be used
          sequentually.
        */
        next_nonce integer not null check(next_nonce >= 0),
      
        /*
          Last imported block number. Is is used in updating statuses of transactions
          in extrinsics table
        */
        last_parsed_block_number integer not null
          check(last_parsed_block_number >= 0),
      
        /* ensures that table has only one row */
        __one_row bool primary key default true check(__one_row)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('blockchain_writer_props');
  }
}
