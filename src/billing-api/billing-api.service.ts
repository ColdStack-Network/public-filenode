import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';
import axios, { AxiosInstance } from 'axios';
import BigNumber from 'bignumber.js';
import { BlockchainWriterService } from '../blockchain-writer/blockchain-writer.service';
import { OracleService } from '../oracle/oracle.service';

const CLS_TOKEN_DECIMALS = 10 ** 18;

@Injectable()
export class BillingApiService {
  private billingApiClient: AxiosInstance;

  constructor(
    @Inject(APP_CONFIGS_KEY)
    appConfigs: TAppConfigs,
    private readonly blockchainWriterService: BlockchainWriterService,
    @Inject(forwardRef(() => OracleService))
    private readonly oracleService: OracleService,
  ) {
    this.billingApiClient = axios.create({
      baseURL: appConfigs.billingApiUrl,
    });
  }

  private async predictPrice(params: { gatewayType: number; storageClass: number; size: number }): Promise<BigNumber> {
    const result = await this.billingApiClient.get('/predict_price', {
      params: {
        gateway_type: params.gatewayType,
        storage_class: params.storageClass,
        size: params.size,
      },
    });

    if (typeof result.data?.predict_price !== 'number') {
      throw new Error(`Invalid response from billing: ${JSON.stringify(result.data)}`);
    }

    return new BigNumber(result.data.predict_price as number).integerValue();
  }

  public async balanceHasAtLeastPredictedPrice(params: {
    publicKey: string;
    gatewayType: number;
    storageClass: number;
    size: number;
  }): Promise<boolean> {
    const balance = await this.blockchainWriterService.getBalance(params.publicKey);
    const price = await this.predictPrice({
      gatewayType: params.gatewayType,
      storageClass: params.storageClass,
      size: params.size,
    });

    return balance.gte(price);
  }

  public async balanceHasAtLeast1Dollar(publicKey: string): Promise<boolean> {
    const balance = await this.blockchainWriterService.getBalance(publicKey);
    const price = await this.oracleService.getPrice('CLS', 'USDC');

    return balance.div(CLS_TOKEN_DECIMALS).times(price.price).gte(1);
  }
}
