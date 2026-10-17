
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn,} from 'typeorm';

@Entity({ name: 'inbox_messages' })
@Index(
  'uq_inbox_consumer_message',
  ['consumerName', 'messageId'],
  { unique: true },
)
export class InboxMessageEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ name: 'consumer_name', type: 'varchar', length: 100 })
  consumerName!: string;

  @Column({ name: 'message_id', type: 'varchar', length: 255 })
  messageId!: string;

  @CreateDateColumn({
    name: 'received_at',
    type: 'timestamptz',
  })
  receivedAt!: Date;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    nullable: true,
  })
  processedAt!: Date | null;
}