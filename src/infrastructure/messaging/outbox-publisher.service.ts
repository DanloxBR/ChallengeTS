import { Injectable, Logger, OnModuleDestroy, OnModuleInit,} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { GetQueueUrlCommand, SQSClient, SendMessageCommand,} from '@aws-sdk/client-sqs';

interface ClaimedOutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

@Injectable()
export class OutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly sqs: SQSClient;
  private readonly queueName: string;
  private readonly instanceId = randomUUID();
  private readonly batchSize = 10;
  private readonly leaseSeconds = 60;

  private queueUrl: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private activePublish: Promise<void> | undefined;
  private publishing = false;
  private stopping = false;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.queueName = config.getOrThrow<string>('SQS_EVENT_QUEUE_NAME');

    this.sqs = new SQSClient({
      region: config.get<string>('AWS_REGION', 'us-east-1'),
      endpoint: config.get<string>(
        'SQS_ENDPOINT',
        'http://localhost:4566',
      ),
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', 'test'),
        secretAccessKey: config.get<string>(
          'AWS_SECRET_ACCESS_KEY',
          'test',
        ),
      },
    });
  }

  onModuleInit(): void {
    this.stopping = false;
    this.startPublishing();

    this.timer = setInterval(() => {
      this.startPublishing();
    }, 5000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (this.activePublish) {
      await this.activePublish;
    }

    this.sqs.destroy();
    this.logger.log('Outbox publisher stopped');
  }

  private startPublishing(): void {
    if (this.publishing || this.stopping) {
      return;
    }

    const task = this.publishPendingEvents();
    this.activePublish = task;

    void task.finally(() => {
      if (this.activePublish === task) {
        this.activePublish = undefined;
      }
    });
  }

  async publishPendingEvents(): Promise<void> {
    if (this.publishing || this.stopping) {
      return;
    }

    this.publishing = true;

    try {
      const events = await this.claimPendingEvents();

      for (const event of events) {
        if (this.stopping) {
          await this.releaseClaim(event.id);
          continue;
        }

        await this.publishEvent(event);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Failed to claim pending outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.publishing = false;
    }
  }

  /** Claims a batch atomically and persists a recoverable lease. */
  private async claimPendingEvents(): Promise<ClaimedOutboxEvent[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      const result: unknown = await queryRunner.query(
        `
        WITH candidates AS (
          SELECT id
          FROM outbox_events
          WHERE published_at IS NULL
            AND (claim_until IS NULL OR claim_until <= NOW())
          ORDER BY created_at ASC, id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events AS event
        SET
          claimed_by = $2,
          claim_until = NOW() + ($3 * INTERVAL '1 second')
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING
          event.id AS id,
          event.aggregate_type AS "aggregateType",
          event.aggregate_id AS "aggregateId",
          event.event_type AS "eventType",
          event.payload AS payload,
          event.created_at AS "createdAt"
        `,
        [this.batchSize, this.instanceId, this.leaseSeconds],
      );

      const rows = this.normalizeQueryRows(result);
      const events = rows.map((row) => this.mapOutboxRow(row));

      await queryRunner.commitTransaction();
      return events;
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * TypeORM's PostgreSQL query result may be a row array or a tuple
   * containing rows and row count, depending on the driver/query path.
   */
  private normalizeQueryRows(result: unknown): unknown[] {
    if (!Array.isArray(result)) {
      throw new Error(
        `Unexpected PostgreSQL result: ${JSON.stringify({
          type: typeof result,
        })}`,
      );
    }

    // Example: [[], 0] means there are no returned rows.
    if (
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === 'number'
    ) {
      return result[0] as unknown[];
    }

    // Normal result: an array of row objects (or an empty array).
    if (
      result.length === 0 ||
      result.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item),
      )
    ) {
      return result;
    }

    // Also accept a single nested array of rows.
    if (result.length === 1 && Array.isArray(result[0])) {
      const nested = result[0] as unknown[];
      if (
        nested.length === 0 ||
        nested.every(
          (item) =>
            item !== null &&
            typeof item === 'object' &&
            !Array.isArray(item),
        )
      ) {
        return nested;
      }
    }

    throw new Error(
      `Unexpected PostgreSQL rows structure: ${JSON.stringify(result)}`,
    );
  }

  private mapOutboxRow(item: unknown): ClaimedOutboxEvent {
    if (
      item === null ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      throw new Error(
        `Invalid outbox row: ${JSON.stringify({
          type: typeof item,
          isArray: Array.isArray(item),
          value: item,
        })}`,
      );
    }

    const row = item as Record<string, unknown>;
    const id = row['id'];
    const aggregateType = row['aggregateType'] ?? row['aggregate_type'];
    const aggregateId = row['aggregateId'] ?? row['aggregate_id'];
    const eventType = row['eventType'] ?? row['event_type'];
    const rawCreatedAt = row['createdAt'] ?? row['created_at'];
    const rawPayload = row['payload'];

    if (
      typeof id !== 'string' ||
      typeof aggregateType !== 'string' ||
      typeof aggregateId !== 'string' ||
      typeof eventType !== 'string'
    ) {
      throw new Error(
        `Invalid outbox row fields: ${JSON.stringify({
          keys: Object.keys(row),
          id,
          aggregateType,
          aggregateId,
          eventType,
          createdAt: rawCreatedAt,
        })}`,
      );
    }

    const createdAt = new Date(
      rawCreatedAt as string | number | Date,
    );
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error(`Invalid createdAt for outbox event ${id}`);
    }

    let payload: Record<string, unknown>;
    if (
      rawPayload !== null &&
      typeof rawPayload === 'object' &&
      !Array.isArray(rawPayload)
    ) {
      payload = rawPayload as Record<string, unknown>;
    } else if (typeof rawPayload === 'string') {
      const parsed: unknown = JSON.parse(rawPayload);
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error(`Invalid payload for outbox event ${id}`);
      }
      payload = parsed as Record<string, unknown>;
    } else {
      throw new Error(`Invalid payload for outbox event ${id}`);
    }

    return {
      id,
      aggregateType,
      aggregateId,
      eventType,
      payload,
      createdAt,
    };
  }

  private async publishEvent(event: ClaimedOutboxEvent): Promise<void> {
    try {
      const queueUrl = await this.getQueueUrl();

      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            eventId: event.id,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload,
            occurredAt: event.createdAt.toISOString(),
          }),
        }),
      );

      const result = await this.dataSource
        .createQueryBuilder()
        .update('outbox_events')
        .set({
          publishedAt: () => 'NOW()',
          attempts: () => '"attempts" + 1',
          claimedBy: () => 'NULL',
          claimUntil: () => 'NULL',
        })
        .where('id = :id', { id: event.id })
        .andWhere('"published_at" IS NULL')
        .andWhere('"claimed_by" = :owner', {
          owner: this.instanceId,
        })
        .execute();

      if (result.affected !== 1) {
        this.logger.warn(
          `Event ${event.id} was sent, but this publisher no longer ` +
            'owns its claim. Duplicate delivery is possible.',
        );
        return;
      }

      this.logger.log(`Published outbox event ${event.id}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to publish outbox event ${event.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      try {
        await this.releaseClaim(event.id);
      } catch (releaseError: unknown) {
        this.logger.error(
          `Failed to release claim for event ${event.id}; ` +
            'the lease will expire automatically',
          releaseError instanceof Error
            ? releaseError.stack
            : String(releaseError),
        );
      }
    }
  }

  private async releaseClaim(eventId: string): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update('outbox_events')
      .set({
        claimedBy: () => 'NULL',
        claimUntil: () => 'NULL',
      })
      .where('id = :id', { id: eventId })
      .andWhere('"published_at" IS NULL')
      .andWhere('"claimed_by" = :owner', {
        owner: this.instanceId,
      })
      .execute();
  }

  private async getQueueUrl(): Promise<string> {
    if (this.queueUrl) {
      return this.queueUrl;
    }

    const result = await this.sqs.send(
      new GetQueueUrlCommand({ QueueName: this.queueName }),
    );

    if (!result.QueueUrl) {
      throw new Error(`SQS queue URL not found: ${this.queueName}`);
    }

    this.queueUrl = result.QueueUrl;
    return this.queueUrl;
  }
}