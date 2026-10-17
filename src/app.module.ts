import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WageringController } from './application/wagering/wagering.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    PersistenceModule,
  ],
  controllers: [
    AppController,
    WageringController,
  ],
  providers: [AppService],
})
export class AppModule {}