import { ConflictException, Injectable, UnprocessableEntityException, } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from '../../domain/wallet';

import { DataSource, EntityManager, QueryFailedError, Repository, } from 'typeorm';
import { Money } from '../../domain/money';
import { TransactionReversalPolicy } from '../../domain/transaction-reversal-policy';
import {FailureCode, WagerTransaction, WagerTransactionKind, WagerTransactionStatus, } from '../../domain/wager-transaction';
import { InboxMessageEntity } from '../../infrastructure/persistence/entities/inbox-message.entity';
import { OutboxEventEntity } from '../../infrastructure/persistence/entities/outbox-event.entity';
import { WalletLedgerEntryEntity } from '../../infrastructure/persistence/entities/wallet-ledger-entry.entity';
import { WagerTransactionEntity } from '../../infrastructure/persistence/entities/wager-transaction.entity';
import { WalletRepository } from '../../infrastructure/persistence/wallet.repository';

export interface ProcessBetInput {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;

  kind: WagerTransactionKind;

  referenceExternalTransactionId?: string;
  amount: string;
  currency: string;

}

export interface InboxMessageInput {
  consumerName: string;
  messageId: string;

}

@Injectable()
export class WageringService {
  constructor( private readonly walletRepository: WalletRepository, @InjectRepository(WagerTransactionEntity)
    private readonly transactionRepository: Repository<WagerTransactionEntity>,
    private readonly dataSource: DataSource,) 
    {}

  async processBet( input: ProcessBetInput,inboxMessage?: InboxMessageInput, ) {
    const amount = Money.from({
      amount: input.amount,
      currency: input.currency,
    });

    if (input.kind === WagerTransactionKind.Opening) {
      throw new UnprocessableEntityException(
        'OPENING is reserved for internal operations',
      );

    }

    if ((input.kind === WagerTransactionKind.Refund || input.kind === WagerTransactionKind.Rollback) && !input.referenceExternalTransactionId?.trim()) {
      
      throw new UnprocessableEntityException( 'A reference transaction is required for REFUND and ROLLBACK', );

    }

    try {

      return await this.walletRepository.withLockedWallet(

        input.walletId,

        async (wallet, manager) => {

          const transactions = manager.getRepository(WagerTransactionEntity);

          const ledgers = manager.getRepository(WalletLedgerEntryEntity);

          const outbox = manager.getRepository(OutboxEventEntity);

          const now = new Date();

          const finish = async <T>(result: T): Promise<T> => {
            
  if (inboxMessage) {
    await manager.getRepository(InboxMessageEntity).update(
      {
        consumerName: inboxMessage.consumerName,
        messageId: inboxMessage.messageId,
      },
      
      { processedAt: now },
    );
  }

  return result;
};

const inboxInserted = await this.registerInbox(
  manager,
  inboxMessage,
  now,
);

if (!inboxInserted && inboxMessage) {
  const inboxRepository = manager.getRepository(InboxMessageEntity);

  const existingInbox = await inboxRepository.findOne({
    where: {
      consumerName: inboxMessage.consumerName,
      messageId: inboxMessage.messageId,
    },
  });

  if (existingInbox?.processedAt) {
    const existingTransaction = await transactions.findOne({
      where: [
        {
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
        },
        {
          providerId: input.providerId,
          idempotencyKey: input.idempotencyKey,
        },
      ],
    });

    if (!existingTransaction) {
      throw new ConflictException(
        'SQS message ID already exists with different transaction data',
      );
    }

    return this.handleDuplicate(existingTransaction, input);
  }

  throw new ConflictException(
    'SQS message is already being processed',
  );
}

          const duplicate = await transactions.findOne({

            where: [

              {

                providerId: input.providerId,

                externalTransactionId: input.externalTransactionId,

              },

              {

                providerId: input.providerId,

                idempotencyKey: input.idempotencyKey,

              },

            ],

          });

          if (duplicate) {

            return finish(this.handleDuplicate(duplicate, input));

          }

          if (wallet.playerId !== input.playerId) {

            throw new UnprocessableEntityException(

              'The wallet does not belong to the specified player',

            );

          }

          if (wallet.currency !== input.currency) {

            throw new UnprocessableEntityException(

              'The wallet currency does not match the transaction currency',

            );

          }

          const transaction = WagerTransaction.create({

            id: randomUUID(),

            providerId: input.providerId,

            externalTransactionId: input.externalTransactionId,

            idempotencyKey: input.idempotencyKey,

            payloadHash: input.payloadHash,

            walletId: wallet.id,

            playerId: input.playerId,

            roundId: input.roundId,

            gameId: input.gameId,

            kind: input.kind,

            money: amount,

            referenceExternalTransactionId:

              input.referenceExternalTransactionId,

            createdAt: now,

          });

          const reference = input.referenceExternalTransactionId

            ? await transactions.findOne({

                where: {

                  providerId: input.providerId,

                  externalTransactionId:

                    input.referenceExternalTransactionId,

                },

              })

            : null;

          let referenceTransactionId: string | null = null;

          if (transaction.requiresReference()) {

if (!reference) {
// A referência pode chegar posteriormente.
// A transação será reprocessada pelo worker.
              transaction.markPendingReference();

              const nextAttemptAt = new Date(now.getTime() + 1000);

              await transactions.insert({
                id: transaction.id,
                providerId: input.providerId,
                externalTransactionId: input.externalTransactionId,
                idempotencyKey: input.idempotencyKey,
                payloadHash: input.payloadHash,
                walletId: wallet.id,
                playerId: input.playerId,
                roundId: input.roundId,
                gameId: input.gameId,
                kind: transaction.kind,
                amountCents: amount.toCents().toString(),
                currency: amount.currency,
                referenceExternalTransactionId:
                  input.referenceExternalTransactionId ?? null,
                referenceTransactionId: null,
                status: transaction.status,
                failureCode: transaction.failureCode ?? null,
                referenceAttempts: 0,
                referenceNextAttemptAt: nextAttemptAt,
                createdAt: now,
                processedAt: null,
              });

              await outbox.insert({
                id: randomUUID(),
                aggregateType: 'WAGER_TRANSACTION',
                aggregateId: transaction.id,
                eventType: 'WagerTransactionPendingReference',
                payload: {
                  transactionId: transaction.id,
                  providerId: input.providerId,
                  externalTransactionId: input.externalTransactionId,
                  referenceExternalTransactionId:
                    input.referenceExternalTransactionId,
                  kind: transaction.kind,
                },
                createdAt: now,
                publishedAt: null,
                attempts: 0,
              });

              return finish({
                transactionId: transaction.id,
                status: transaction.status,
                failureCode: transaction.failureCode,
                duplicate: false,
              });
            }

            const referenceDomain = WagerTransaction.rehydrate({

              id: reference.id,

              providerId: reference.providerId,

              externalTransactionId: reference.externalTransactionId,

              idempotencyKey: reference.idempotencyKey,

              payloadHash: reference.payloadHash,

              walletId: reference.walletId,

              playerId: reference.playerId,

              roundId: reference.roundId,

              gameId: reference.gameId,

              kind: reference.kind as WagerTransactionKind,

              money: Money.fromCents(

                BigInt(reference.amountCents),

                reference.currency,

              ),

              referenceExternalTransactionId:

                reference.referenceExternalTransactionId ?? undefined,

              referenceTransactionId:

                reference.referenceTransactionId ?? undefined,

              status: reference.status as WagerTransactionStatus,

              failureCode:

                (reference.failureCode as FailureCode | null) ?? undefined,

              createdAt: reference.createdAt,

              processedAt: reference.processedAt ?? undefined,

            });

            const policyFailure = TransactionReversalPolicy.validate(

              transaction,

              referenceDomain,

            );

            if (policyFailure) {

              transaction.reject(policyFailure);

            } else {

              referenceTransactionId = reference.id;

              const alreadyReversed = await transactions

                .createQueryBuilder('tx')

                .where('tx.provider_id = :providerId', {

                  providerId: input.providerId,

                })

                .andWhere('tx.reference_transaction_id = :referenceId', {

                  referenceId: reference.id,

                })

                .andWhere('tx.kind = :kind', { kind: input.kind })

                .andWhere('tx.status = :status', {

                  status: WagerTransactionStatus.Processed,

                })

                .getOne();

              if (alreadyReversed) {

                transaction.reject(FailureCode.ReferenceAlreadyReversed);

              }

            }

          }

          await transactions.insert({

            id: transaction.id,

            providerId: input.providerId,

            externalTransactionId: input.externalTransactionId,

            idempotencyKey: input.idempotencyKey,

            payloadHash: input.payloadHash,

            walletId: wallet.id,

            playerId: input.playerId,

            roundId: input.roundId,

            gameId: input.gameId,

            kind: transaction.kind,

            amountCents: amount.toCents().toString(),

            currency: amount.currency,

            referenceExternalTransactionId:

              input.referenceExternalTransactionId ?? null,

            referenceTransactionId,

            status: transaction.status,

            failureCode: transaction.failureCode ?? null,

            createdAt: now,

            processedAt: null,

          });

          if (transaction.status === WagerTransactionStatus.Rejected) {

            await outbox.insert({

              id: randomUUID(),

              aggregateType: 'WAGER_TRANSACTION',

              aggregateId: transaction.id,

              eventType: 'WagerTransactionRejected',

              payload: {

                transactionId: transaction.id,

                kind: transaction.kind,

                failureCode: transaction.failureCode,

              },

              createdAt: now,

              publishedAt: null,

              attempts: 0,

            });

            return finish({

              transactionId: transaction.id,

              status: transaction.status,

              failureCode: transaction.failureCode,

              duplicate: false,

            });

          }

          const balanceBefore = wallet.balance;

          let direction: 'DEBIT' | 'CREDIT' | null = null;

          switch (input.kind) {

            case WagerTransactionKind.Bet:

              if (wallet.balance.isLessThan(amount)) {

                transaction.reject(FailureCode.InsufficientFunds);

              } else {

                wallet.debit(amount, now);

                direction = 'DEBIT';

              }

              break;

            case WagerTransactionKind.Win:

            case WagerTransactionKind.Refund:

              wallet.credit(amount, now);

              direction = 'CREDIT';

              break;

            case WagerTransactionKind.Rollback:

              if (wallet.balance.isLessThan(amount)) {

                transaction.reject(

                  FailureCode.ReversalBalanceInsufficient,

                );

              } else {

                wallet.debit(amount, now);

                direction = 'DEBIT';

              }

              break;

            case WagerTransactionKind.Loss:

              break;

            default:

              throw new UnprocessableEntityException(

                'Unsupported transaction kind',

              );

          }

          if (

            transaction.isTerminal() &&

            transaction.status !== WagerTransactionStatus.Processed &&

            transaction.status !== WagerTransactionStatus.Failed

          ) {

            await transactions.update(

              { id: transaction.id },

              {

                status: transaction.status,

                failureCode: transaction.failureCode ?? null,

              },

            );

            await outbox.insert({

              id: randomUUID(),

              aggregateType: 'WAGER_TRANSACTION',

              aggregateId: transaction.id,

              eventType: 'WagerTransactionRejected',

              payload: {

                transactionId: transaction.id,

                kind: transaction.kind,

                failureCode: transaction.failureCode,

              },

              createdAt: now,

              publishedAt: null,

              attempts: 0,

            });

            return finish({

              transactionId: transaction.id,

              status: transaction.status,

              failureCode: transaction.failureCode,

              duplicate: false,

            });

          }

          transaction.markProcessed(referenceTransactionId ?? undefined, now);

          await transactions.update(

            { id: transaction.id },

            {

              status: transaction.status,

              referenceTransactionId: referenceTransactionId ?? undefined,

              processedAt: transaction.processedAt ?? now,

            },

          );

          if (direction) {

            await ledgers.insert({

              id: randomUUID(),

              walletId: wallet.id,

              transactionId: transaction.id,

              direction,

              amountCents: amount.toCents().toString(),

              currency: amount.currency,

              balanceBeforeCents: balanceBefore.toCents().toString(),

              balanceAfterCents: wallet.balance.toCents().toString(),

              createdAt: now,

            });

          }

          await outbox.insert({

            id: randomUUID(),

            aggregateType: 'WAGER_TRANSACTION',

            aggregateId: transaction.id,

            eventType: 'WagerTransactionProcessed',

            payload: {

              transactionId: transaction.id,

              walletId: wallet.id,

              playerId: input.playerId,

              roundId: input.roundId,

              gameId: input.gameId,

              kind: input.kind,

              amount: amount.toDecimal(),

              currency: amount.currency,

              balanceAfter: wallet.balance.toDecimal(),

              referenceTransactionId: referenceTransactionId ?? undefined,

            },

            createdAt: now,

            publishedAt: null,

            attempts: 0,

          });

          if (direction) {

            await outbox.insert({

              id: randomUUID(),

              aggregateType: 'WALLET',

              aggregateId: wallet.id,

              eventType: 'WalletBalanceChanged',

              payload: {

                walletId: wallet.id,

                playerId: input.playerId,

                currency: wallet.currency,

                balanceBefore: balanceBefore.toDecimal(),

                balanceAfter: wallet.balance.toDecimal(),

                transactionId: transaction.id,

              },

              createdAt: now,

              publishedAt: null,

              attempts: 0,

            });

          }

          return finish({

            transactionId: transaction.id,

            status: transaction.status,

            balance: wallet.balance.toJSON(),

            duplicate: false,

          });

        },

      );

    } catch (error: unknown) {

      if (

        error instanceof QueryFailedError &&

        (

          error as QueryFailedError & {

            driverError?: { code?: string };

          }

        ).driverError?.code === '23505'

      ) {

        const concurrentDuplicate = await this.findExistingTransaction(input);

      if (concurrentDuplicate) {
  const result = this.handleDuplicate(concurrentDuplicate, input);

  if (inboxMessage) {
    await this.recordInboxAfterDuplicate(inboxMessage);
  }

  return result;
}

      }

      throw error;

    }

  }

  private async registerInbox(
  manager: EntityManager,
  inboxMessage: InboxMessageInput | undefined,
  now: Date,
): Promise<boolean> {
  if (!inboxMessage) {
    return true;
  }

  const result = await manager
    .getRepository(InboxMessageEntity)
    .createQueryBuilder()
    .insert()
    .values({
      id: randomUUID(),
      consumerName: inboxMessage.consumerName,
      messageId: inboxMessage.messageId,
      receivedAt: now,
      processedAt: null,
    })
    .orIgnore()
    .returning('*')
    .execute();

  return result.raw.length > 0;}

  private async recordInboxAfterDuplicate(
  inboxMessage: InboxMessageInput,
): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    const now = new Date();
    const inbox = manager.getRepository(InboxMessageEntity);

    await inbox
      .createQueryBuilder()
      .insert()
      .values({
        id: randomUUID(),
        consumerName: inboxMessage.consumerName,
        messageId: inboxMessage.messageId,
        receivedAt: now,
        processedAt: now,
      })
      .orIgnore()
      .execute();

    await inbox.update(
      {
        consumerName: inboxMessage.consumerName,
        messageId: inboxMessage.messageId,
      },
      { processedAt: now },
    );
  });
}

  private async findExistingTransaction(

    input: ProcessBetInput,

  ): Promise<WagerTransactionEntity | null> {

    return this.transactionRepository.findOne({

      where: [

        {

          providerId: input.providerId,

          externalTransactionId: input.externalTransactionId,

        },

        {

          providerId: input.providerId,

          idempotencyKey: input.idempotencyKey,

        },

      ],

    });

  }

  private handleDuplicate(

    existing: WagerTransactionEntity,

    input: ProcessBetInput,

  ) {

    const requestedAmountCents = Money.from({

      amount: input.amount,

      currency: input.currency,

    })

      .toCents()

      .toString();

    const sameRequest =

      existing.providerId === input.providerId &&

      existing.externalTransactionId === input.externalTransactionId &&

      existing.idempotencyKey === input.idempotencyKey &&

      existing.payloadHash === input.payloadHash &&

      existing.walletId === input.walletId &&

      existing.playerId === input.playerId &&

      existing.roundId === input.roundId &&

      existing.gameId === input.gameId &&

      existing.kind === input.kind &&

      existing.referenceExternalTransactionId ===

        (input.referenceExternalTransactionId ?? null) &&

      existing.amountCents === requestedAmountCents &&

      existing.currency === input.currency;

    if (!sameRequest) {

      throw new ConflictException(

        'Transaction identifiers already exist with different data',

      );

    }

    return {

      transactionId: existing.id,

      status: existing.status,

      failureCode: existing.failureCode,

      duplicate: true,

    };

  }

  
  
  async retryPendingReferences(): Promise<void> {
    const now = new Date();

    const pendingWallets = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.wallet_id', 'walletId')
      .where('tx.status = :status', {
        status: WagerTransactionStatus.PendingReference,
      })
      .andWhere('tx.reference_next_attempt_at IS NOT NULL')
      .andWhere('tx.reference_next_attempt_at <= :now', { now })
      .distinct(true)
      .orderBy('tx.wallet_id', 'ASC')
      .limit(100)
      .getRawMany<{ walletId: string }>();

    for (const { walletId } of pendingWallets) {
      await this.walletRepository.withLockedWallet(
        walletId,
        async (wallet, manager) => {
          const transactions = manager.getRepository(
            WagerTransactionEntity,
          );

          const pending = await transactions
            .createQueryBuilder('tx')
            .where('tx.wallet_id = :walletId', { walletId })
            .andWhere('tx.status = :status', {
              status: WagerTransactionStatus.PendingReference,
            })
            .andWhere('tx.reference_next_attempt_at IS NOT NULL')
            .andWhere('tx.reference_next_attempt_at <= :now', {
              now: new Date(),
            })
            .orderBy('tx.created_at', 'ASC')
            .limit(10)
            .getMany();

          for (const entity of pending) {
            await this.processPendingReference(
              entity,
              wallet,
              manager,
            );
          }
        },
      );
    }
  }

  private async processPendingReference(
  entity: WagerTransactionEntity,
  wallet: Wallet,
  manager: EntityManager,
): Promise<void> {
    const transactions = manager.getRepository(WagerTransactionEntity);
    const ledgers = manager.getRepository(WalletLedgerEntryEntity);
    const outbox = manager.getRepository(OutboxEventEntity);
    const now = new Date();

// Reconfirma o estado dentro da transação.
    const current = await transactions.findOne({
      where: {
        id: entity.id,
        status: WagerTransactionStatus.PendingReference,
      },
    });

    if (
      !current ||
      !current.referenceExternalTransactionId ||
      !current.referenceNextAttemptAt ||
      current.referenceNextAttemptAt > now
    ) {
      return;
    }

    const reference = await transactions.findOne({
      where: {
        providerId: current.providerId,
        externalTransactionId:
          current.referenceExternalTransactionId,
      },
    });

    const rejectTransaction = async (
      failureCode: FailureCode,
    ): Promise<void> => {
      await transactions.update(
        { id: current.id },
        {
          status: WagerTransactionStatus.Rejected,
          failureCode,
          referenceNextAttemptAt: null,
          processedAt: null,
        },
      );

      await outbox.insert({
        id: randomUUID(),
        aggregateType: 'WAGER_TRANSACTION',
        aggregateId: current.id,
        eventType: 'WagerTransactionRejected',
        payload: {
          transactionId: current.id,
          kind: current.kind,
          failureCode,
        },
        createdAt: now,
        publishedAt: null,
        attempts: 0,
      });
    };

    if (!reference) {
      const attempts = current.referenceAttempts + 1;
      const maxAttempts = 10;
      const maxAgeMs = 30 * 60 * 1000;
      const expired = now.getTime() - current.createdAt.getTime()
        >= maxAgeMs;

      if (attempts >= maxAttempts || expired) {
        await transactions.update(
          { id: current.id },
          { referenceAttempts: attempts },
        );

        await rejectTransaction(FailureCode.ReferenceNotFound);
        return;
      }

      const delayMs = Math.min(
        1000 * 2 ** attempts,
        5 * 60 * 1000,
      );

      await transactions.update(
        { id: current.id },
        {
          referenceAttempts: attempts,
          referenceNextAttemptAt: new Date(
            now.getTime() + delayMs,
          ),
        },
      );

      return;
    }

    const toDomain = (row: WagerTransactionEntity) =>
      WagerTransaction.rehydrate({
        id: row.id,
        providerId: row.providerId,
        externalTransactionId: row.externalTransactionId,
        idempotencyKey: row.idempotencyKey,
        payloadHash: row.payloadHash,
        walletId: row.walletId,
        playerId: row.playerId,
        roundId: row.roundId,
        gameId: row.gameId,
        kind: row.kind as WagerTransactionKind,
        money: Money.fromCents(
          BigInt(row.amountCents),
          row.currency,
        ),
        referenceExternalTransactionId:
          row.referenceExternalTransactionId ?? undefined,
        referenceTransactionId:
          row.referenceTransactionId ?? undefined,
        status: row.status as WagerTransactionStatus,
        failureCode:
          (row.failureCode as FailureCode | null) ?? undefined,
        createdAt: row.createdAt,
        processedAt: row.processedAt ?? undefined,
      });

    const transaction = toDomain(current);
    const referenceDomain = toDomain(reference);

    const policyFailure = TransactionReversalPolicy.validate(
      transaction,
      referenceDomain,
    );

    if (policyFailure) {
      await rejectTransaction(policyFailure);
      return;
    }

    const alreadyReversed = await transactions
      .createQueryBuilder('tx')
      .where('tx.provider_id = :providerId', {
        providerId: current.providerId,
      })
      .andWhere('tx.reference_transaction_id = :referenceId', {
        referenceId: reference.id,
      })
      .andWhere('tx.kind = :kind', { kind: current.kind })
      .andWhere('tx.status = :status', {
        status: WagerTransactionStatus.Processed,
      })
      .getOne();

    if (alreadyReversed) {
      await rejectTransaction(FailureCode.ReferenceAlreadyReversed);
      return;
    }

    const amount = Money.fromCents(
      BigInt(current.amountCents),
      current.currency,
    );

    if (
      wallet.playerId !== current.playerId ||
      wallet.currency !== current.currency
    ) {
      await rejectTransaction(FailureCode.InvalidReference);
      return;
    }

    const balanceBefore = wallet.balance;
    let direction: 'DEBIT' | 'CREDIT';

    if (current.kind === WagerTransactionKind.Refund) {
      wallet.credit(amount, now);
      direction = 'CREDIT';
    } else if (current.kind === WagerTransactionKind.Rollback) {
      if (wallet.balance.isLessThan(amount)) {
        await rejectTransaction(
          FailureCode.ReversalBalanceInsufficient,
        );
        return;
      }

      wallet.debit(amount, now);
      direction = 'DEBIT';
    } else {
      await rejectTransaction(FailureCode.InvalidTransaction);
      return;
    }

    transaction.markProcessed(reference.id, now);

    await transactions.update(
      { id: current.id },
      {
        status: WagerTransactionStatus.Processed,
        referenceTransactionId: reference.id,
        referenceAttempts: current.referenceAttempts,
        referenceNextAttemptAt: null,
        failureCode: null,
        processedAt: now,
      },
    );

    await ledgers.insert({
      id: randomUUID(),
      walletId: wallet.id,
      transactionId: current.id,
      direction,
      amountCents: amount.toCents().toString(),
      currency: amount.currency,
      balanceBeforeCents: balanceBefore.toCents().toString(),
      balanceAfterCents: wallet.balance.toCents().toString(),
      createdAt: now,
    });

    await outbox.insert({
      id: randomUUID(),
      aggregateType: 'WAGER_TRANSACTION',
      aggregateId: current.id,
      eventType: 'WagerTransactionProcessed',
      payload: {
        transactionId: current.id,
        walletId: wallet.id,
        playerId: current.playerId,
        roundId: current.roundId,
        gameId: current.gameId,
        kind: current.kind,
        amount: amount.toDecimal(),
        currency: amount.currency,
        balanceAfter: wallet.balance.toDecimal(),
        referenceTransactionId: reference.id,
      },
      createdAt: now,
      publishedAt: null,
      attempts: 0,
    });

    await outbox.insert({
      id: randomUUID(),
      aggregateType: 'WALLET',
      aggregateId: wallet.id,
      eventType: 'WalletBalanceChanged',
      payload: {
        walletId: wallet.id,
        playerId: current.playerId,
        currency: wallet.currency,
        balanceBefore: balanceBefore.toDecimal(),
        balanceAfter: wallet.balance.toDecimal(),
        transactionId: current.id,
      },
      createdAt: now,
      publishedAt: null,
      attempts: 0,
    });
  }
}