import { Inject, Injectable } from '@nestjs/common';
import { IPrice } from './interfaces/price.interface';
import axios, { AxiosInstance } from 'axios';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';

@Injectable()
export class OracleService {
  private readonly axios: AxiosInstance;

  constructor(
    @Inject(APP_CONFIGS_KEY)
    appConfigs: TAppConfigs,
  ) {
    this.axios = axios.create({
      baseURL: appConfigs.oraclenodeUrl,
    });
  }

  async getPrice(fromSymbol: string, toSymbol: string): Promise<IPrice> {
    const response = await this.axios.get('/price', {
      params: {
        fromSymbol,
        toSymbol,
      },
    });

    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt),
    };
  }
}
