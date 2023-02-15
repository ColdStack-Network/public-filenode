import { typeormConfigsFactory } from './typeorm.config';
import { ConfigModuleOptions } from '@nestjs/config/dist/interfaces';
import { appConfigsFactory } from './app.config';
import { clsConfigsFactory } from './cls.config';
import { gatewaysConfigsFactory } from './gateways.config';

export const configModuleOptions: ConfigModuleOptions = {
  load: [typeormConfigsFactory, appConfigsFactory, clsConfigsFactory, gatewaysConfigsFactory],
  isGlobal: true,
};
