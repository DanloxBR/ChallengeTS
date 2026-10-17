
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WageringService } from '../../application/wagering/wagering.service';
import { OutboxPublisherService } from '../messaging/outbox-publisher.service';
import { SqsConsumerService } from '../messaging/sqs-consumer.service';

import { PendingReferenceWorkerService } from '../workers/pending-reference-worker.service';
import { InboxMessageEntity } from './entities/inbox-message.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { WalletEntity } from './entities/wallet.entity';
import { WalletLedgerEntryEntity } from './entities/wallet-ledger-entry.entity';
import { WagerTransactionEntity } from './entities/wager-transaction.entity';

import { WalletRepository } from './wallet.repository';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WagerTransactionEntity,
      WalletLedgerEntryEntity,
      OutboxEventEntity,
      InboxMessageEntity,
    ]),
  ],
  providers: [
    WalletRepository,
    WageringService,
    OutboxPublisherService,
    SqsConsumerService,
    PendingReferenceWorkerService,
  ],
  exports: [
    WalletRepository,
    WageringService,
    TypeOrmModule,
  ],
})
export class PersistenceModule {}