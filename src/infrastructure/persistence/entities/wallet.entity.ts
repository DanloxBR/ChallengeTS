
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, VersionColumn,} from 'typeorm';

@Entity({ name: 'wallets' })
export class WalletEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ name: 'player_id', type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  @Column({ name: 'balance_cents', type: 'bigint', default: '0' })
  balanceCents!: string;

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}