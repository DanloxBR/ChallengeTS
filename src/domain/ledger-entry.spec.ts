
import { describe, expect, it } from '@jest/globals';
import { Money } from './money';
import { LedgerDirection, WalletLedgerEntry,} from './wallet-ledger-entry';

describe('WalletLedgerEntry', () => {
  it('creates a valid debit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction: LedgerDirection.Debit,
      money: Money.fromDecimal('30.00'),
      balanceBefore: Money.fromDecimal('100.00'),
      balanceAfter: Money.fromDecimal('70.00'),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.balanceAfter.toDecimal()).toBe('70.00');
  });

  it('creates a valid credit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-2',
      walletId: 'wallet-1',
      transactionId: 'transaction-2',
      direction: LedgerDirection.Credit,
      money: Money.fromDecimal('20.00'),
      balanceBefore: Money.fromDecimal('70.00'),
      balanceAfter: Money.fromDecimal('90.00'),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.balanceAfter.toDecimal()).toBe('90.00');
  });

  it('rejects an unbalanced entry', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-3',
        walletId: 'wallet-1',
        transactionId: 'transaction-3',
        direction: LedgerDirection.Debit,
        money: Money.fromDecimal('30.00'),
        balanceBefore: Money.fromDecimal('100.00'),
        balanceAfter: Money.fromDecimal('80.00'),
      }),
    ).toThrow('Ledger entry is not balanced');
  });

  it('rejects a debit that produces a negative balance', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-4',
        walletId: 'wallet-1',
        transactionId: 'transaction-4',
        direction: LedgerDirection.Debit,
        money: Money.fromDecimal('30.00'),
        balanceBefore: Money.fromDecimal('20.00'),
        balanceAfter: Money.fromDecimal('-10.00'),
      }),
    ).toThrow('Ledger balance cannot be negative');
  });

  it('rejects a zero amount', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-5',
        walletId: 'wallet-1',
        transactionId: 'transaction-5',
        direction: LedgerDirection.Credit,
        money: Money.zero('BRL'),
        balanceBefore: Money.fromDecimal('20.00'),
        balanceAfter: Money.fromDecimal('20.00'),
      }),
    ).toThrow('Ledger amount must be positive');
  });
});