import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { loadConfig } from './config/configuration';
import type { DatabaseConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { CryptoModule } from './crypto/crypto.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [loadConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        ...buildDataSourceOptions(
          configService.get<DatabaseConfig>('database')!,
        ),
        autoLoadEntities: true,
      }),
    }),
    CryptoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
