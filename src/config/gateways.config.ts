import { registerAs, ConfigType } from '@nestjs/config';

export const gatewaysConfigsFactory = registerAs('gateways', () => ({
  gatewayChooserAIUrl: process.env.GATEWAY_CHOOSER_AI_URL,
}));

export const GATEWAYS_CONFIGS_KEY = gatewaysConfigsFactory.KEY;
export type TGatewaysConfigs = ConfigType<typeof gatewaysConfigsFactory>;
