import { Inject, Injectable } from '@nestjs/common';
import { GATEWAYS_CONFIGS_KEY, TGatewaysConfigs } from '../config/gateways.config';
import { ChooseGatewayRequestBodyDto } from './dto/choose-gateway-request-body.dto';
import axios, { AxiosInstance } from 'axios';
import { GatewayFromBlockchain } from './dto/gateway-from-blockchain.dto';
import { ChooseGatewayV2ResponseDto } from './dto/choose-gateway-v2-response.dto';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';
import { keccak256AxiosInterceptor } from 'keccak-256-auth';

@Injectable()
export class GatewayChooserAiService {
  private readonly axios: AxiosInstance;

  constructor(
    @Inject(GATEWAYS_CONFIGS_KEY)
    gatewaysConfigs: TGatewaysConfigs,
    @Inject(APP_CONFIGS_KEY)
    appConfigs: TAppConfigs,
  ) {
    this.axios = axios.create({
      baseURL: gatewaysConfigs.gatewayChooserAIUrl,
    });

    this.axios.interceptors.request.use(
      keccak256AxiosInterceptor({
        privateKey: appConfigs.filenodeWalletPrivateKey,
      }),
    );
  }

  /**
   * TODO: validate the response
   */
  async chooseGatewayFromBlockchain(input: ChooseGatewayRequestBodyDto): Promise<ChooseGatewayV2ResponseDto> {
    const res = await this.axios.post<ChooseGatewayV2ResponseDto>('/v2/choose-gateway', input);

    return res.data;
  }

  async getGatewayByEthereumAddress(address: string): Promise<GatewayFromBlockchain> {
    const res = await this.axios.get<GatewayFromBlockchain>('/gateways/' + address);

    return res.data;
  }
}
