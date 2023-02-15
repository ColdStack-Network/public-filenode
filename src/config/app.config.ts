import { registerAs, ConfigType } from '@nestjs/config';

export const appConfigsFactory = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',
  useBucketSubdomains: process.env.USE_BUCKET_SUBDOMAINS === 'true',
  baseUrl: process.env.BASE_URL,
  authnodeUrl: process.env.AUTHNODE_URL,
  oraclenodeUrl: process.env.ORACLENODE_URL,
  billingApiUrl: process.env.BILLING_API,
  disableMinimalBalance: process.env.DISABLE_MINIMAL_BALANCE === 'true',
  filenodeWalletPrivateKey: process.env.FILENODE_WALLET_PRIVATE_KEY,
}));

export const APP_CONFIGS_KEY = appConfigsFactory.KEY;
export type TAppConfigs = ConfigType<typeof appConfigsFactory>;
