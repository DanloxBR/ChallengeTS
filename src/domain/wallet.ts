
import { Money } from './money';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    private readonly _playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  get playerId(): string {
    return this._playerId;
  }

  static open(props: OpenWalletProps): Wallet {
    if (!props.id.trim()) {
      throw new Error('Wallet id is required');
    }

    if (!props.playerId.trim()) {
      throw new Error('Player id is required');
    }

    if (props.initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      new Date(),
      new Date(),
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, at: Date = new Date()): void {
    this.assertSameCurrency(amount);

    if (!amount.isPositive()) {
      throw new Error('Debit amount must be positive');
    }

    if (this._balance.isLessThan(amount)) {
      throw new Error('Insufficient funds');
    }

    this._balance = this._balance.subtract(amount);
    this._version += 1;
    this._updatedAt = at;
  }

  credit(amount: Money, at: Date = new Date()): void {
    this.assertSameCurrency(amount);

    if (!amount.isPositive()) {
      throw new Error('Credit amount must be positive');
    }

    this._balance = this._balance.add(amount);
    this._version += 1;
    this._updatedAt = at;
  }

  private assertSameCurrency(amount: Money): void {
    if (this.currency !== amount.currency) {
      throw new Error('Currency mismatch');
    }
  }
}