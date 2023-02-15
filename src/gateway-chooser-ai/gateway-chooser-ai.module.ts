import { Module } from '@nestjs/common';
import { GatewayChooserAiService } from './gateway-chooser-ai.service';

@Module({
  providers: [GatewayChooserAiService],
  exports: [GatewayChooserAiService],
})
export class GatewayChooserAiModule {}
