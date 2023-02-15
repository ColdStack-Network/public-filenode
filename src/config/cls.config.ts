import { registerAs, ConfigType } from '@nestjs/config';

export const clsConfigsFactory = registerAs('cls', () => ({
  disableBlockchainWriting: process.env.DISABLE_BLOCKCHAIN_WRITING === 'true',
  coldstack_node_url: process.env.COLDSTACK_NODE_URL,
  coldstack_account_uri: process.env.COLDSTACK_ACCOUNT_URI,
}));

export const CLS_CONFIGS_KEY = clsConfigsFactory.KEY;
export type TCLSConfigs = ConfigType<typeof clsConfigsFactory>;
