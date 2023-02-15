import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlockchainWriterTables1619123205197 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table blockchain_writer_props(
        cls_last_parsed_block_number integer not null,
        cls_next_nonce integer not null
      );
      
      create table cls_extrinsics (
        cls_nonce integer not null primary key check (cls_nonce >= 0),
      
        cls_signed_extrinsic varchar not null 
          /* first two symbols are 0x, length must be greater than 2 */
          check (length(cls_signed_extrinsic) > 2),
      
        cls_extrinsic_hash char(66) not null unique check (length(cls_extrinsic_hash) = 66),
      
        cls_last_submit_time timestamp null, /* null if was not submitted */
      
        cls_blocknumber integer null /* null until included in block */,
      
        cls_blockhash char(66) null /* null until included in block */
          check (cls_blockhash is null or length(cls_blockhash) = 66),
      
        cls_extrinsic_index integer null /* null until included in block */,
      
        error varchar null check(
          (status = 'FAILED' and error is not null) 
          or 
          (status != 'FAILED' and error is null)),
      
        status varchar not null check (status in (
            'NEW', /* NEW until included in block */
            'FINISHED', /* Finished after included and finalized in block */
            'FAILED' /* Finalized in block, but produced error */
          ))
      );
      
      create index on cls_extrinsics(status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('blockchain_writer_props');
    await queryRunner.dropTable('cls_extrinsics');
  }
}
