
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn,} from 'typeorm';

@Entity({ name: 'wallet_ledger_entries' })
@Index('uq_wallet_ledger_transaction', ['transactionId'], {
  unique: true,
})
export class WalletLedgerEntryEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ name: 'wallet_id', type: 'varchar', length: 100 })
  walletId!: string;

  @Column({ name: 'transaction_id', type: 'varchar', length: 100 })
  transactionId!: string;

  @Column({ type: 'varchar', length: 10 })
  direction!: string;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string;

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  @Column({ name: 'balance_before_cents', type: 'bigint' })
  balanceBeforeCents!: string;

  @Column({ name: 'balance_after_cents', type: 'bigint' })
  balanceAfterCents!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;
}