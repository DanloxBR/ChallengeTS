
import { afterAll, beforeAll, describe, expect, it, jest,} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { OutboxPublisherService } from '../../infrastructure/messaging/outbox-publisher.service';
import { SqsConsumerService } from '../../infrastructure/messaging/sqs-consumer.service';

import { WageringService } from './wagering.service';
import { FailureCode, WagerTransactionKind, WagerTransactionStatus,} from '../../domain/wager-transaction';

import { WalletEntity } from '../../infrastructure/persistence/entities/wallet.entity';
import { WagerTransactionEntity } from '../../infrastructure/persistence/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../infrastructure/persistence/entities/wallet-ledger-entry.entity';
import { OutboxEventEntity } from '../../infrastructure/persistence/entities/outbox-event.entity';

describe('WageringService - integraÃ§Ã£o PostgreSQL', () => {
  let moduleFixture: TestingModule;
  let app: INestApplication;
  let dataSource: DataSource;
  let wageringService: WageringService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        DatabaseModule,
        PersistenceModule,
      ],
    })
      .overrideProvider(OutboxPublisherService)
      .useValue({
        publishPendingEvents: jest.fn(),
      })
      .overrideProvider(SqsConsumerService)
      .useValue({
        pollMessages: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    wageringService = app.get(WageringService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it(
    'aprova somente uma de duas apostas concorrentes de R$ 80,00 com saldo de R$ 100,00',
    async () => {
      const suffix = randomUUID();
      const walletId = `wallet-concurrency-${suffix}`;
      const playerId = `player-concurrency-${suffix}`;
      const providerId = `provider-concurrency-${suffix}`;
      const now = new Date();

      const wallets = dataSource.getRepository(WalletEntity);
      const transactions = dataSource.getRepository(WagerTransactionEntity);
      const ledger = dataSource.getRepository(WalletLedgerEntryEntity);
      const outbox = dataSource.getRepository(OutboxEventEntity);

      await wallets.insert({
        id: walletId,
        playerId,
        currency: 'BRL',
        balanceCents: '10000',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const createBet = (number: number) => ({
        providerId,
        externalTransactionId: `bet-${number}-${suffix}`,
        idempotencyKey: `idem-${number}-${suffix}`,
        payloadHash: `hash-${number}-${suffix}`,
        walletId,
        playerId,
        roundId: `round-${suffix}`,
        gameId: 'integration-game',
        kind: WagerTransactionKind.Bet,
        amount: '80.00',
        currency: 'BRL',
      });

      const results = await Promise.all([
        wageringService.processBet(createBet(1)),
        wageringService.processBet(createBet(2)),
      ]);

      const wallet = await wallets.findOneByOrFail({ id: walletId });

      const persistedTransactions = await transactions.find({
        where: { walletId },
      });

      const persistedLedger = await ledger.find({
        where: { walletId },
      });

      const transactionIds = persistedTransactions.map((tx) => tx.id);

      const transactionEvents = await outbox
        .createQueryBuilder('event')
        .where('event.aggregate_id IN (:...transactionIds)', {
          transactionIds,
        })
        .getMany();

      const processed = results.filter(
        (result) => result.status === WagerTransactionStatus.Processed,
      );

      const rejected = results.filter(
        (result) => result.status === WagerTransactionStatus.Rejected,
      );

      expect(processed).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].failureCode).toBe(FailureCode.InsufficientFunds);

      expect(wallet.balanceCents).toBe('2000');
      expect(persistedTransactions).toHaveLength(2);

      expect(
        persistedTransactions.filter(
          (tx) => tx.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);

      expect(
        persistedTransactions.filter(
          (tx) => tx.status === WagerTransactionStatus.Rejected,
        ),
      ).toHaveLength(1);

      // Apenas a aposta aprovada deve gerar dÃ©bito.
      expect(persistedLedger).toHaveLength(1);
      expect(persistedLedger[0].direction).toBe('DEBIT');
      expect(persistedLedger[0].amountCents).toBe('8000');
      expect(persistedLedger[0].balanceBeforeCents).toBe('10000');
      expect(persistedLedger[0].balanceAfterCents).toBe('2000');

      // Deve haver um evento de processamento e um de rejeiÃ§Ã£o.
      expect(
        transactionEvents.filter(
          (event) => event.eventType === 'WagerTransactionProcessed',
        ),
      ).toHaveLength(1);

      expect(
        transactionEvents.filter(
          (event) => event.eventType === 'WagerTransactionRejected',
        ),
      ).toHaveLength(1);

      // Deve existir apenas um evento de alteraÃ§Ã£o de saldo para esta carteira.
      const balanceChangedEvents = await outbox
        .createQueryBuilder('event')
        .where('event.event_type = :eventType', {
          eventType: 'WalletBalanceChanged',
        })
        .andWhere("event.payload ->> 'walletId' = :walletId", {
          walletId,
        })
        .getMany();

      expect(balanceChangedEvents).toHaveLength(1);
    },
    30000,
  );

  it(
    'nÃ£o debita novamente quando a mesma aposta Ã© enviada duas vezes',
    async () => {
      const suffix = randomUUID();
      const walletId = `wallet-idempotency-${suffix}`;
      const playerId = `player-idempotency-${suffix}`;
      const providerId = `provider-idempotency-${suffix}`;
      const now = new Date();

      const wallets = dataSource.getRepository(WalletEntity);
      const transactions = dataSource.getRepository(WagerTransactionEntity);
      const ledger = dataSource.getRepository(WalletLedgerEntryEntity);

      await wallets.insert({
        id: walletId,
        playerId,
        currency: 'BRL',
        balanceCents: '10000',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const bet = {
        providerId,
        externalTransactionId: `bet-idempotency-${suffix}`,
        idempotencyKey: `idem-${suffix}`,
        payloadHash: `hash-${suffix}`,
        walletId,
        playerId,
        roundId: `round-${suffix}`,
        gameId: 'integration-game',
        kind: WagerTransactionKind.Bet,
        amount: '80.00',
        currency: 'BRL',
      };

      const firstResult = await wageringService.processBet(bet);
      const secondResult = await wageringService.processBet(bet);

      const wallet = await wallets.findOneByOrFail({ id: walletId });
      const persistedTransactions = await transactions.find({
        where: { walletId },
      });
      const persistedLedger = await ledger.find({
        where: { walletId },
      });

      expect(firstResult.status).toBe(WagerTransactionStatus.Processed);
      expect(firstResult.duplicate).toBe(false);

      expect(secondResult.status).toBe(WagerTransactionStatus.Processed);
      expect(secondResult.duplicate).toBe(true);
      expect(secondResult.transactionId).toBe(firstResult.transactionId);

      expect(wallet.balanceCents).toBe('2000');
      expect(persistedTransactions).toHaveLength(1);
      expect(persistedLedger).toHaveLength(1);

      expect(persistedLedger[0].transactionId).toBe(firstResult.transactionId);
      expect(persistedLedger[0].amountCents).toBe('8000');
      expect(persistedLedger[0].balanceBeforeCents).toBe('10000');
      expect(persistedLedger[0].balanceAfterCents).toBe('2000');
    },
    30000,
  );

  
it(
  'processa apenas uma aposta quando a mesma requisiÃ§Ã£o Ã© enviada 50 vezes simultaneamente',
  async () => {
    const suffix = randomUUID();
    const walletId = `wallet-50-requests-${suffix}`;
    const playerId = `player-50-requests-${suffix}`;
    const providerId = `provider-50-requests-${suffix}`;
    const now = new Date();

    const wallets = dataSource.getRepository(WalletEntity);
    const transactions = dataSource.getRepository(WagerTransactionEntity);
    const ledger = dataSource.getRepository(WalletLedgerEntryEntity);

    await wallets.insert({
      id: walletId,
      playerId,
      currency: 'BRL',
      balanceCents: '10000',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const bet = {
      providerId,
      externalTransactionId: `bet-50-requests-${suffix}`,
      idempotencyKey: `idem-50-requests-${suffix}`,
      payloadHash: `hash-${suffix}`,
      walletId,
      playerId,
      roundId: `round-${suffix}`,
      gameId: 'integration-game',
      kind: WagerTransactionKind.Bet,
      amount: '80.00',
      currency: 'BRL',
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        wageringService.processBet(bet),
      ),
    );

    const wallet = await wallets.findOneByOrFail({ id: walletId });
    const persistedTransactions = await transactions.find({
      where: { walletId },
    });
    const persistedLedger = await ledger.find({
      where: { walletId },
    });

    expect(results).toHaveLength(50);
    expect(
      results.filter((result) => result.duplicate === false),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.duplicate === true),
    ).toHaveLength(49);

    expect(
      new Set(results.map((result) => result.transactionId)).size,
    ).toBe(1);

    expect(
      results.every(
        (result) => result.status === WagerTransactionStatus.Processed,
      ),
    ).toBe(true);

    expect(wallet.balanceCents).toBe('2000');
    expect(persistedTransactions).toHaveLength(1);
    expect(persistedLedger).toHaveLength(1);

    expect(persistedLedger[0].direction).toBe('DEBIT');
    expect(persistedLedger[0].amountCents).toBe('8000');
    expect(persistedLedger[0].balanceBeforeCents).toBe('10000');
    expect(persistedLedger[0].balanceAfterCents).toBe('2000');
  },
  60000,
);
});