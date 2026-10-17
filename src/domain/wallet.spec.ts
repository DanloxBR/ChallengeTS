
import { describe, expect, it } from '@jest/globals';
import { Money } from './money';
import { Wallet } from './wallet';

describe('Wallet', () => {
  it('opens a wallet with the initial balance and version 1', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.fromDecimal('100.00'),
    });

    expect(wallet.balance.toDecimal()).toBe('100.00');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.version).toBe(1);
  });

  it('debits and credits money', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.fromDecimal('100.00'),
    });

    wallet.debit(Money.fromDecimal('30.50'));
    expect(wallet.balance.toDecimal()).toBe('69.50');
    expect(wallet.version).toBe(2);

    wallet.credit(Money.fromDecimal('10.00'));
    expect(wallet.balance.toDecimal()).toBe('79.50');
    expect(wallet.version).toBe(3);
  });

  it('rejects a debit above the balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-2',
      playerId: 'player-2',
      initialBalance: Money.fromDecimal('20.00'),
    });

    expect(() => wallet.debit(Money.fromDecimal('20.01')))
      .toThrow('Insufficient funds');

    expect(wallet.balance.toDecimal()).toBe('20.00');
    expect(wallet.version).toBe(1);
  });

  it('rejects zero or negative debit amounts', () => {
    const wallet = Wallet.open({
      id: 'wallet-3',
      playerId: 'player-3',
      initialBalance: Money.fromDecimal('20.00'),
    });

    expect(() => wallet.debit(Money.zero('BRL')))
      .toThrow('Debit amount must be positive');

    expect(() => wallet.debit(Money.fromDecimal('-1.00')))
      .toThrow('Debit amount must be positive');
  });

  it('rejects zero or negative credit amounts', () => {
    const wallet = Wallet.open({
      id: 'wallet-4',
      playerId: 'player-4',
      initialBalance: Money.fromDecimal('20.00'),
    });

    expect(() => wallet.credit(Money.zero('BRL')))
      .toThrow('Credit amount must be positive');

    expect(() => wallet.credit(Money.fromDecimal('-1.00')))
      .toThrow('Credit amount must be positive');
  });

  it('rejects operations in a different currency', () => {
    const wallet = Wallet.open({
      id: 'wallet-5',
      playerId: 'player-5',
      initialBalance: Money.fromDecimal('20.00', 'BRL'),
    });

    expect(() => wallet.debit(Money.fromDecimal('5.00', 'USD')))
      .toThrow('Currency mismatch');

    expect(() => wallet.credit(Money.fromDecimal('5.00', 'USD')))
      .toThrow('Currency mismatch');
  });

  it('rehydrates a wallet from persisted state', () => {
    const createdAt = new Date('2026-01-01T10:00:00.000Z');
    const updatedAt = new Date('2026-01-01T11:00:00.000Z');

    const wallet = Wallet.rehydrate({
      id: 'wallet-6',
      playerId: 'player-6',
      currency: 'BRL',
      balance: Money.fromDecimal('75.00'),
      version: 4,
      createdAt,
      updatedAt,
    });

    expect(wallet.id).toBe('wallet-6');
    expect(wallet.playerId).toBe('player-6');
    expect(wallet.balance.toDecimal()).toBe('75.00');
    expect(wallet.version).toBe(4);
    expect(wallet.createdAt).toBe(createdAt);
    expect(wallet.updatedAt).toBe(updatedAt);
  });
});