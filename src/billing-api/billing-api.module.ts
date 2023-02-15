import { Module } from '@nestjs/common';
import { BlockchainWriterModule } from '../blockchain-writer/blockchain-writer.module';
import { OracleModule } from '../oracle/oracle.module';
import { BillingApiService } from './billing-api.service';

@Module({
  imports: [BlockchainWriterModule, OracleModule],
  providers: [BillingApiService],
  exports: [BillingApiService],
})
export class BillingApiModule {}
