import { Inject, Injectable } from '@nestjs/common';
import { CLS_CONFIGS_KEY, TCLSConfigs } from '../config/cls.config';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { ApiPromise } from '@polkadot/api';
import { POLKADOT_API_PROVIDER_TOKEN } from './constants/polkadot-account-provider-token';
import BigNumber from 'bignumber.js';

@Injectable()
export class BlockchainWriterService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @Inject(CLS_CONFIGS_KEY)
    private readonly clsConfigs: TCLSConfigs,
    @Inject(POLKADOT_API_PROVIDER_TOKEN)
    private readonly polkadotApi: ApiPromise,
  ) {}

  /**
   * Gets balance * 10 ^ 18.
   */
  public async getBalance(address: string): Promise<BigNumber> {
    const balanceWithZeros = await this.polkadotApi.query.coldStack.balances(address);

    return new BigNumber(balanceWithZeros.toString());
  }

  /**
   * Runs transaction and returns it's nonce
   */
  public async download(params: {
    user_eth_address: string;
    file_name_hash: string;
    file_size_bytes: string;
    file_contents_hash: string;
    gateway_eth_address: string;
  }): Promise<void> {
    await this.insertMethodCall('download', [
      params.user_eth_address,
      params.file_name_hash,
      params.file_size_bytes,
      params.file_contents_hash,
      params.gateway_eth_address,
    ]);
  }

  /**
   * Runs transaction and returns it's nonce
   */
  public async delete(params: { user_eth_address: string; file_name_hash: string }): Promise<void> {
    await this.insertMethodCall('delete', [params.user_eth_address, params.file_name_hash]);
  }

  /**
   * Runs transaction and returns it's nonce
   */
  public async upload(params: {
    user_eth_address: string;
    file_name_hash: string;
    file_size_bytes: string;
    file_contents_hash: string;
    gateway_eth_address: string;
    file_storage_class: string;
    is_forced: string;
  }): Promise<void> {
    await this.insertMethodCall('upload', [
      params.user_eth_address,
      params.file_name_hash,
      params.file_size_bytes,
      params.file_contents_hash,
      params.gateway_eth_address,
      params.file_storage_class,
      params.is_forced,
    ]);
  }

  private async insertMethodCall(method: string, args: any[]): Promise<void> {
    if (this.clsConfigs.disableBlockchainWriting) {
      return;
    }

    await this.entityManager.query('insert into blockchain_transactions(method, args) values($1, $2)', [method, args]);
  }
}
