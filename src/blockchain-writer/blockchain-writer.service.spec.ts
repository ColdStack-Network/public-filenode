import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainWriterService } from './blockchain-writer.service';

describe('BlockchainWriterService', () => {
  let service: BlockchainWriterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlockchainWriterService],
    }).compile();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    service = module.get<BlockchainWriterService>(BlockchainWriterService);
  });
});
