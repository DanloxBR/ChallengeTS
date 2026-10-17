
import { FailureCode, WagerTransaction, WagerTransactionKind, WagerTransactionStatus,} from './wager-transaction';

export class TransactionReversalPolicy {
  static validate(
    reversal: WagerTransaction,
    reference: WagerTransaction,
  ): FailureCode | null {
    if (!reversal.requiresReference()) {
      return FailureCode.InvalidTransaction;
    }

    if (reference.status !== WagerTransactionStatus.Processed) {
      return FailureCode.InvalidReference;
    }

    if (
      reversal.providerId !== reference.providerId ||
      reversal.playerId !== reference.playerId ||
      reversal.walletId !== reference.walletId ||
      reversal.roundId !== reference.roundId ||
      reversal.money.currency !== reference.money.currency
    ) {
      return FailureCode.InvalidReference;
    }

    if (!reversal.money.equals(reference.money)) {
      return FailureCode.InvalidAmount;
    }

    if (
      reversal.kind === WagerTransactionKind.Refund &&
      reference.kind !== WagerTransactionKind.Bet
    ) {
      return FailureCode.InvalidReference;
    }

    if (
      reversal.kind === WagerTransactionKind.Rollback &&
      reference.kind !== WagerTransactionKind.Bet &&
      reference.kind !== WagerTransactionKind.Win &&
      reference.kind !== WagerTransactionKind.Refund
    ) {
      return FailureCode.InvalidReference;
    }

    return null;
  }
}