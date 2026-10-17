
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn,} from 'typeorm';

@Entity({ name: 'wager_transactions' })
@Index(
  'uq_wager_provider_external_transaction',
  ['providerId', 'externalTransactionId'],
  { unique: true },
)
@Index(
  'uq_wager_provider_idempotency',
  ['providerId', 'idempotencyKey'],
  { unique: true },
)
export class WagerTransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ name: 'provider_id', type: 'varchar', length: 100 })
  providerId!: string;

  @Column({
    name: 'external_transaction_id',
    type: 'varchar',
    length: 255,
  })
  externalTransactionId!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
  })
  idempotencyKey!: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 255 })
  payloadHash!: string;

  @Column({ name: 'wallet_id', type: 'varchar', length: 100 })
  walletId!: string;

  @Column({ name: 'player_id', type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ name: 'round_id', type: 'varchar', length: 100 })
  roundId!: string;

  @Column({ name: 'game_id', type: 'varchar', length: 100 })
  gameId!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: string;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string;

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  @Column({
    name: 'reference_external_transaction_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referenceExternalTransactionId!: string | null;

  @Column({
    name: 'reference_transaction_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceTransactionId!: string | null;

  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({
    name: 'failure_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  failureCode!: string | null;

  @Column({
    name: 'reference_attempts',
    type: 'integer',
    default: 0,
  })
  referenceAttempts!: number;

  @Column({
    name: 'reference_next_attempt_at',
    type: 'timestamptz',
    nullable: true,
  })
  referenceNextAttemptAt!: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    nullable: true,
  })
  processedAt!: Date | null;
}
