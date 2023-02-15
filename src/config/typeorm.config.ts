import { ConfigType, registerAs } from '@nestjs/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export const typeormConfigsFactory = registerAs(
  'typeorm',
  (): PostgresConnectionOptions => ({
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    type: 'postgres',
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: `${process.env.DB_DATABASE}${process.env.NODE_ENV === 'test' ? '_test' : ''}`,
    logging: process.env.NODE_ENV === 'development',
    dropSchema: process.env.NODE_ENV === 'test',
  }),
);

export const TYPEORM_CONFIGS_KEY = typeormConfigsFactory.KEY;
export type TTypeORMConfigs = ConfigType<typeof typeormConfigsFactory>;
