
import { describe, expect, it } from '@jest/globals';
import { Money } from './money';

describe('Money', () => {
  it('should preserve decimal precision', () => {
    const first = Money.fromDecimal('0.10');
    const second = Money.fromDecimal('0.20');

    expect(first.add(second).toDecimal()).toBe('0.30');
  });

  it('should support negative values internally', () => {
    const amount = Money.fromDecimal('-12.35');

    expect(amount.isNegative()).toBe(true);
    expect(amount.toDecimal()).toBe('-12.35');
  });

  it('should reject more than two decimal places', () => {
    expect(() => Money.fromDecimal('10.999')).toThrow(
      'Invalid monetary value. Use up to two decimal places.',
    );
  });

  it('should serialize amount and currency as JSON', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });

  it('should create zero for a currency', () => {
    const money = Money.zero('BRL');

    expect(money.toDecimal()).toBe('0.00');
    expect(money.isZero()).toBe(true);
  });

  it('should negate a positive amount', () => {
    const money = Money.fromDecimal('12.50', 'BRL');

    expect(money.negate().toDecimal()).toBe('-12.50');
  });

  it('should reject negative amounts at the input boundary', () => {
    expect(() =>
      Money.from({
        amount: '-10.00',
        currency: 'BRL',
      }),
    ).toThrow('Negative monetary values are not allowed');
  });

  it('should reject operations with different currencies', () => {
    const brl = Money.fromDecimal('10.00', 'BRL');
    const usd = Money.fromDecimal('10.00', 'USD');

    expect(() => brl.add(usd)).toThrow('Currency mismatch');
  });
});