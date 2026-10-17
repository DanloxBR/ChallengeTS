
import { describe, expect, it } from '@jest/globals';
import { Money } from './money';
import { FailureCode, WagerTransaction, WagerTransactionKind, WagerTransactionStatus,} from './wager-transaction';

describe('WagerTransaction', () => {
  const createTransaction = (
    kind = WagerTransactionKind.Bet,
    referenceExternalTransactionId?: string,
  ) =>
    WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-a',
      externalTransactionId: 'external-1',
      idempotencyKey: 'provider-a:external-1',
      payloadHash: 'hash-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind,
      money: Money.fromDecimal('10.00'),
      referenceExternalTransactionId,
    });

  it('starts in PENDING', () => {
    const transaction = createTransaction();

    expect(transaction.status).toBe(
      WagerTransactionStatus.Pending,
    );
  });

  it('requires a reference for REFUND', () => {
    expect(() =>
      createTransaction(WagerTransactionKind.Refund),
    ).toThrow('Transaction reference is required');
  });

  it('requires a reference for ROLLBACK', () => {
    expect(() =>
      createTransaction(WagerTransactionKind.Rollback),
    ).toThrow('Transaction reference is required');
  });

  it('rejects OPENING from external creation', () => {
    expect(() =>
      createTransaction(WagerTransactionKind.Opening),
    ).toThrow('OPENING is an internal transaction');
  });

  it('marks a transaction as processed', () => {
    const transaction = createTransaction();
    const processedAt = new Date('2026-01-01T12:00:00.000Z');

    transaction.markProcessed(undefined, processedAt);

    expect(transaction.status).toBe(
      WagerTransactionStatus.Processed,
    );
    expect(transaction.processedAt).toEqual(processedAt);
    expect(transaction.isTerminal()).toBe(true);
  });

  it('rejects state changes after a terminal status', () => {
    const transaction = createTransaction();

    transaction.reject(FailureCode.InsufficientFunds);

    expect(() =>
      transaction.markProcessed(undefined, new Date()),
    ).toThrow('Transaction is already in a terminal state');
  });

  it('detects a different payload hash', () => {
    const transaction = createTransaction();

    expect(transaction.matchesPayload('hash-1')).toBe(true);
    expect(transaction.matchesPayload('different-hash')).toBe(false);
  });

  it('marks a transaction as pending reference', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Refund,
      'external-bet-1',
    );

    transaction.markPendingReference();

    expect(transaction.status).toBe(
      WagerTransactionStatus.PendingReference,
    );
  });

  it('does not affect balance while pending', () => {
    const transaction = createTransaction();

    expect(transaction.affectsBalance()).toBe(false);
  });

  it('affects balance when a BET is processed', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Bet,
    );

    transaction.markProcessed(undefined, new Date());

    expect(transaction.affectsBalance()).toBe(true);
  });

  it('does not affect balance when a LOSS is processed', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Loss,
    );

    transaction.markProcessed(undefined, new Date());

    expect(transaction.affectsBalance()).toBe(false);
  });

  it('does not affect balance when rejected', () => {
    const transaction = createTransaction();

    transaction.reject(FailureCode.InsufficientFunds);

    expect(transaction.affectsBalance()).toBe(false);
  });

  it('does not affect balance when failed', () => {
    const transaction = createTransaction();

    transaction.fail(FailureCode.InvalidTransaction);

    expect(transaction.affectsBalance()).toBe(false);
  });
});