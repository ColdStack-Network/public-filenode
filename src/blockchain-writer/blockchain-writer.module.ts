import { Module } from '@nestjs/common';
import { BlockchainWriterService } from './blockchain-writer.service';
import { POLKADOT_API_PROVIDER_TOKEN } from './constants/polkadot-account-provider-token';
import { POLKADOT_API_ACCOUNT_TOKEN } from './constants/polkadot-api-provider-token';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import * as WasmCrypto from '@polkadot/wasm-crypto';
import { CLS_CONFIGS_KEY, TCLSConfigs } from '../config/cls.config';

@Module({
  providers: [
    BlockchainWriterService,
    {
      provide: POLKADOT_API_PROVIDER_TOKEN,
      async useFactory(blockchainConfigs: TCLSConfigs): Promise<ApiPromise> {
        if (blockchainConfigs.disableBlockchainWriting) {
          return null;
        }

        await WasmCrypto.waitReady();

        const provider = new WsProvider(blockchainConfigs.coldstack_node_url);
        const api = await ApiPromise.create({
          provider,
          types: {
            Gateway: {
              address: 'Vec<u8>',
              seedAddress: 'Option<Vec<u8>>',
              storage: 'u8',
              is_active: 'bool',
            },
          },
        });

        return api;
      },
      inject: [CLS_CONFIGS_KEY],
    },
    {
      provide: POLKADOT_API_ACCOUNT_TOKEN,
      async useFactory(blockchainConfigs: TCLSConfigs): Promise<KeyringPair> {
        if (blockchainConfigs.disableBlockchainWriting) {
          return null;
        }

        await WasmCrypto.waitReady();

        const keyring = new Keyring({ type: 'sr25519' });
        const account = keyring.addFromUri(blockchainConfigs.coldstack_account_uri);

        return account;
      },
      inject: [CLS_CONFIGS_KEY],
    },
  ],
  exports: [BlockchainWriterService],
})
export class BlockchainWriterModule {}
