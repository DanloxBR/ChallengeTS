import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.getOrThrow<string>('DB_HOST');
        const port = Number(config.getOrThrow<string>('DB_PORT'));
        const username = config.getOrThrow<string>('DB_USERNAME');
        const password = config.getOrThrow<string>('DB_PASSWORD');
        const database = config.getOrThrow<string>('DB_DATABASE');

        console.log('[DatabaseModule] Configuração:', {
          host,
          port,
          username,
          passwordLoaded: password.length > 0,
          database,
        });

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 5,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}