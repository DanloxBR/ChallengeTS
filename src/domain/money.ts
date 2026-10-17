
export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly cents: bigint,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!props.currency || !props.currency.trim()) {
      throw new Error('Currency is required');
    }

    if (props.currency !== props.currency.trim()) {
      throw new Error('Invalid currency');
    }

    const amount = props.amount;

    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error(
        'Invalid monetary value. Use up to two decimal places.',
      );
    }

    const negative = amount.startsWith('-');

    if (negative) {
      throw new Error('Negative monetary values are not allowed');
    }

    return Money.fromDecimal(amount, props.currency);
  }

  static fromCents(
    cents: bigint,
    currency = 'BRL',
  ): Money {
    return new Money(cents, currency);
  }

  static fromDecimal(
    value: string,
    currency = 'BRL',
  ): Money {
    const normalized = value.trim();

    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new Error(
        'Invalid monetary value. Use up to two decimal places.',
      );
    }

    const negative = normalized.startsWith('-');
    const unsigned = negative ? normalized.slice(1) : normalized;
    const [whole, fraction = ''] = unsigned.split('.');

    const cents =
      BigInt(whole) * 100n +
      BigInt(fraction.padEnd(2, '0'));

    return new Money(negative ? -cents : cents, currency);
  }

  static zero(currency: string): Money {
    if (!currency || !currency.trim()) {
      throw new Error('Currency is required');
    }

    return Money.fromCents(0n, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(
      this.cents + other.cents,
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(
      this.cents - other.cents,
      this.currency,
    );
  }

  negate(): Money {
    return Money.fromCents(-this.cents, this.currency);
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents === other.cents;
  }

  toCents(): bigint {
    return this.cents;
  }

  toDecimal(): string {
    const negative = this.cents < 0n;
    const absolute = negative ? -this.cents : this.cents;

    const whole = absolute / 100n;
    const fraction = (absolute % 100n)
      .toString()
      .padStart(2, '0');

    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toDecimal(),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.toDecimal()} ${this.currency}`;
  }
}
