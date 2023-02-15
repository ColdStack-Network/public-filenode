export class GatewayFromBlockchain {
  nodeAddress: string;
  seedAddress: string;
  storage: number;
  storageText: 'WRESERVE' | 'SRESERVE' | 'FRESERVE' | 'SIA' | 'ARWEAVE' | 'FILECOIN' | 'LAMBDA';
  url: string;

  constructor(data: GatewayFromBlockchain) {
    Object.assign(this, data);
  }
}
