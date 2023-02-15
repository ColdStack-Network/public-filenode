import { Module } from '@nestjs/common';
import { ErrorsModule } from '../errors/errors.module';
import { TaggingService } from './tagging.service';

@Module({
  imports: [ErrorsModule],
  providers: [TaggingService],
  exports: [TaggingService],
})
export class TaggingModule {}
