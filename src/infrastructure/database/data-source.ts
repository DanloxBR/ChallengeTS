import dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? '.env',
});

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USERNAME ?? 'jungle',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE ?? 'jungle',
  synchronize: false,
  logging: false,
  migrations: ['src/infrastructure/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});