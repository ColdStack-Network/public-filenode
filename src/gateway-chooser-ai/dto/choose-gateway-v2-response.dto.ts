import { GatewayType } from '../../gateways/gateway-type.enum';

export class ChosenGatewayV2Dto {
  nodeAddress: string;

  seedAddress?: string;

  storage: number;

  storageText: GatewayType;

  url: string;

  constructor(data: ChosenGatewayV2Dto) {
    Object.assign(this, data);
  }
}

export class ChooseGatewayV2ResponseDto {
  forceChoosenGatewayType?: GatewayType;

  gateways: ChosenGatewayV2Dto[];

  constructor(data: ChooseGatewayV2ResponseDto) {
    Object.assign(this, data, { gateways: data.gateways.map((gateway) => new ChosenGatewayV2Dto(gateway)) });
  }
}
