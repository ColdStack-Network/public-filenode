import { Module } from '@nestjs/common';
import { GatewaysV3Service } from './gateways-v3.service';

@Module({
  providers: [GatewaysV3Service],
  exports: [GatewaysV3Service],
})
export class GatewaysModule {}
