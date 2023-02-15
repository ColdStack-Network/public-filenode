import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessKeyRepository } from './repositories/access-key.repository';
import { ObjectsModule } from '../objects/objects.module';

@Module({
  imports: [forwardRef(() => ObjectsModule), TypeOrmModule.forFeature([AccessKeyRepository])],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
