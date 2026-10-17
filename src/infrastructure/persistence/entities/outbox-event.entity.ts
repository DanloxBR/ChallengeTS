
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn,} from 'typeorm';

@Entity({ name: 'outbox_events' })
@Index('idx_outbox_pending', ['publishedAt', 'createdAt'])
export class OutboxEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 100 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 100 })
  aggregateId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 150 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @Column({
    name: 'published_at',
    type: 'timestamptz',
    nullable: true,
  })
  publishedAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({
    name: 'claimed_by',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  claimedBy!: string | null;

  @Column({
    name: 'claim_until',
    type: 'timestamptz',
    nullable: true,
  })
  claimUntil!: Date | null;
}