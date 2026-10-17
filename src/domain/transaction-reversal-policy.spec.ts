
import { describe, expect, it } from '@jest/globals';
import { Money } from './money';
import { FailureCode, WagerTransaction, WagerTransactionKind,} from './wager-transaction';
import { TransactionReversalPolicy } from './transaction-reversal-policy';

describe('TransactionReversalPolicy', () => {
  const createTransaction = (
    id: string,
    kind: WagerTransactionKind,
    referenceExternalTransactionId?: string,
  ) =>
    WagerTransaction.create({
      id,
      providerId: 'provider-a',
      externalTransactionId: id,
      idempotencyKey: `provider-a:${id}`,
      payloadHash: `hash-${id}`,
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind,
      money: Money.fromDecimal('10.00'),
      referenceExternalTransactionId,
    });

  const createProcessed = (
    id: string,
    kind: WagerTransactionKind,
  ) => {
    const transaction = createTransaction(id, kind);
    transaction.markProcessed(undefined, new Date());
    return transaction;
  };

  it('accepts a REFUND of a processed BET', () => {
    const bet = createProcessed('bet-1', WagerTransactionKind.Bet);
    const refund = createTransaction(
      'refund-1',
      WagerTransactionKind.Refund,
      'bet-1',
    );

    expect(
      TransactionReversalPolicy.validate(refund, bet),
    ).toBeNull();
  });

  it('rejects REFUND of a WIN', () => {
    const win = createProcessed('win-1', WagerTransactionKind.Win);
    const refund = createTransaction(
      'refund-1',
      WagerTransactionKind.Refund,
      'win-1',
    );

    expect(
      TransactionReversalPolicy.validate(refund, win),
    ).toBe(FailureCode.InvalidReference);
  });

  it('rejects a reference that is not processed', () => {
    const bet = createTransaction('bet-1', WagerTransactionKind.Bet);
    const refund = createTransaction(
      'refund-1',
      WagerTransactionKind.Refund,
      'bet-1',
    );

    expect(
      TransactionReversalPolicy.validate(refund, bet),
    ).toBe(FailureCode.InvalidReference);
  });

  it('rejects different wallets', () => {
    const bet = createProcessed('bet-1', WagerTransactionKind.Bet);
    const refund = createTransaction(
      'refund-1',
      WagerTransactionKind.Refund,
      'bet-1',
    );

    const otherWalletBet = WagerTransaction.rehydrate({
      id: bet.id,
      providerId: bet.providerId,
      externalTransactionId: bet.externalTransactionId,
      idempotencyKey: bet.idempotencyKey,
      payloadHash: bet.payloadHash,
      walletId: 'wallet-2',
      playerId: bet.playerId,
      roundId: bet.roundId,
      gameId: bet.gameId,
      kind: bet.kind,
      money: bet.money,
      referenceExternalTransactionId:
        bet.referenceExternalTransactionId,
      createdAt: bet.createdAt,
      status: bet.status,
      processedAt: bet.processedAt,
    });

    expect(
      TransactionReversalPolicy.validate(refund, otherWalletBet),
    ).toBe(FailureCode.InvalidReference);
  });

  it('rejects a different amount', () => {
    const bet = createProcessed('bet-1', WagerTransactionKind.Bet);

    const refund = WagerTransaction.create({
      id: 'refund-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      idempotencyKey: 'provider-a:refund-1',
      payloadHash: 'hash-refund',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.fromDecimal('5.00'),
      referenceExternalTransactionId: 'bet-1',
    });

    expect(
      TransactionReversalPolicy.validate(refund, bet),
    ).toBe(FailureCode.InvalidAmount);
  });

  it('rejects a reference with a different currency', () => {
    const bet = createProcessed('bet-1', WagerTransactionKind.Bet);

    const refund = WagerTransaction.create({
      id: 'refund-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      idempotencyKey: 'provider-a:refund-1',
      payloadHash: 'hash-refund',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.fromDecimal('10.00', 'USD'),
      referenceExternalTransactionId: 'bet-1',
    });

    expect(
      TransactionReversalPolicy.validate(refund, bet),
    ).toBe(FailureCode.InvalidReference);
  });

  it('rejects a reference from a different round', () => {
    const bet = createProcessed('bet-1', WagerTransactionKind.Bet);

    const refund = WagerTransaction.create({
      id: 'refund-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      idempotencyKey: 'provider-a:refund-1',
      payloadHash: 'hash-refund',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-2',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.fromDecimal('10.00'),
      referenceExternalTransactionId: 'bet-1',
    });

    expect(
      TransactionReversalPolicy.validate(refund, bet),
    ).toBe(FailureCode.InvalidReference);
  });
});