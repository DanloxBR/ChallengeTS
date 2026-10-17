
import { Injectable, Logger, OnModuleDestroy, OnModuleInit,} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient,} from '@aws-sdk/client-sqs';
import { createHash } from 'node:crypto';

import { WageringService, ProcessBetInput,} from '../../application/wagering/wagering.service';
import { WagerTransactionKind } from '../../domain/wager-transaction';

interface WagerTransactionRequested {
  messageId: string;
  type: 'WagerTransactionRequested';
  occurredAt: string;
  data: {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    referenceExternalTransactionId?: string;
    money: {
      amount: string;
      currency: string;
    };
  };
}

class InvalidSqsMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSqsMessageError';
  }
}

@Injectable()
export class SqsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly client: SQSClient;
  private readonly queueName: string;
  private readonly consumerName = 'wager-transactions-consumer';

  private queueUrl: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private activePoll: Promise<void> | undefined;
  private polling = false;
  private stopping = false;

  constructor(
    private readonly wageringService: WageringService,
    private readonly config: ConfigService,
  ) {
    this.queueName = config.getOrThrow<string>(
      'SQS_REQUEST_QUEUE_NAME',
    );

    this.client = new SQSClient({
      region: config.get<string>('AWS_REGION', 'us-east-1'),
      endpoint: config.get<string>(
        'SQS_ENDPOINT',
        'http://localhost:4566',
      ),
      credentials: {
        accessKeyId: config.get<string>(
          'AWS_ACCESS_KEY_ID',
          'test',
        ),
        secretAccessKey: config.get<string>(
          'AWS_SECRET_ACCESS_KEY',
          'test',
        ),
      },
    });
  }

  onModuleInit(): void {
    this.stopping = false;

    this.startPolling();

    this.timer = setInterval(() => {
      this.startPolling();
    }, 5000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (this.activePoll) {
      await this.activePoll;
    }

    this.client.destroy();
    this.logger.log('SQS consumer stopped');
  }

  private startPolling(): void {
    if (this.polling || this.stopping) {
      return;
    }

    const poll = this.pollMessages();
    this.activePoll = poll;

    void poll.finally(() => {
      if (this.activePoll === poll) {
        this.activePoll = undefined;
      }
    });
  }

  async pollMessages(): Promise<void> {
    if (this.polling || this.stopping) {
      return;
    }

    this.polling = true;

    try {
      const queueUrl = await this.getQueueUrl();

      if (this.stopping) {
        return;
      }

      const result = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 10,
          VisibilityTimeout: 60,
          MessageSystemAttributeNames: [
            'ApproximateReceiveCount',
          ],
        }),
      );

      for (const message of result.Messages ?? []) {
        if (this.stopping) {
          break;
        }

        if (!message.Body || !message.ReceiptHandle) {
          this.logger.warn(
            'SQS returned a message without body or receipt handle',
          );
          continue;
        }

        await this.processMessage(
          queueUrl,
          message.Body,
          message.ReceiptHandle,
          message.MessageId,
          message.Attributes?.ApproximateReceiveCount,
        );
      }
    } catch (error: unknown) {
      if (this.stopping) {
        this.logger.warn(
          'SQS polling stopped while an operation was in progress',
        );
      } else {
        this.logger.error(
          'Failed to poll SQS messages',
          error instanceof Error ? error.stack : String(error),
        );
      }
    } finally {
      this.polling = false;
    }
  }

  private async processMessage(
    queueUrl: string,
    body: string,
    receiptHandle: string,
    sqsMessageId?: string,
    receiveCount?: string,
  ): Promise<void> {
    let messageId = sqsMessageId ?? 'unknown';

    try {
      const message = this.parseMessage(body);
      messageId = message.messageId;

      const input = this.toProcessBetInput(message);

      /*
       * Inbox and financial changes must be committed atomically
       * by WageringService before the SQS message is acknowledged.
       */
      const result = await this.wageringService.processBet(input, {
        consumerName: this.consumerName,
        messageId: message.messageId,
      });

      this.logger.log(
        `Wager request handled: messageId=${message.messageId}, ` +
          `transactionId=${result.transactionId}, ` +
          `status=${result.status}, duplicate=${result.duplicate}`,
      );

      /*
       * A persisted business rejection is a successfully handled
       * message. PENDING_REFERENCE is also acknowledged because
       * follow-up processing must be managed by the application.
       */
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
    } catch (error: unknown) {
      const detail =
        error instanceof Error ? error.message : String(error);

      if (error instanceof InvalidSqsMessageError) {
        this.logger.error(
          `Invalid SQS message; leaving it for retry/DLQ: ` +
            `messageId=${messageId}, receiveCount=${receiveCount ?? 'unknown'}, ` +
            `reason=${detail}`,
        );
      } else {
        this.logger.error(
          `Wager request failed; message was not deleted: ` +
            `messageId=${messageId}, receiveCount=${receiveCount ?? 'unknown'}, ` +
            `reason=${detail}`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      /*
       * Do not delete failed messages.
       * The queue's redrive policy handles repeated receives.
       */
    }
  }

  private parseMessage(body: string): WagerTransactionRequested {
    let value: unknown;

    try {
      value = JSON.parse(body) as unknown;
    } catch {
      throw new InvalidSqsMessageError(
        'SQS message body is not valid JSON',
      );
    }

    if (!this.isRecord(value)) {
      throw new InvalidSqsMessageError(
        'SQS message must contain a JSON object',
      );
    }

    if (
      value.type !== 'WagerTransactionRequested' ||
      !this.isNonEmptyString(value.messageId) ||
      !this.isNonEmptyString(value.occurredAt) ||
      !this.isRecord(value.data)
    ) {
      throw new InvalidSqsMessageError(
        'Invalid WagerTransactionRequested message envelope',
      );
    }

    const data = value.data;

    if (
      !this.isNonEmptyString(data.providerId) ||
      !this.isNonEmptyString(data.externalTransactionId) ||
      !this.isNonEmptyString(data.idempotencyKey) ||
      !this.isNonEmptyString(data.playerId) ||
      !this.isNonEmptyString(data.walletId) ||
      !this.isNonEmptyString(data.roundId) ||
      !this.isNonEmptyString(data.gameId) ||
      !this.isRecord(data.money) ||
      !this.isNonEmptyString(data.money.amount) ||
      !this.isNonEmptyString(data.money.currency)
    ) {
      throw new InvalidSqsMessageError(
        'Invalid wager transaction data',
      );
    }

    const allowedKinds = Object.values(
      WagerTransactionKind,
    ) as string[];

    if (
      typeof data.kind !== 'string' ||
      !allowedKinds.includes(data.kind)
    ) {
      throw new InvalidSqsMessageError(
        `Unsupported wager transaction kind: ${String(data.kind)}`,
      );
    }

    if (
      data.referenceExternalTransactionId !== undefined &&
      !this.isNonEmptyString(data.referenceExternalTransactionId)
    ) {
      throw new InvalidSqsMessageError(
        'Invalid referenceExternalTransactionId',
      );
    }

    return value as unknown as WagerTransactionRequested;
  }

  private toProcessBetInput(
    message: WagerTransactionRequested,
  ): ProcessBetInput {
    const data = message.data;

    /*
     * Hash a fixed, ordered representation so JSON property order
     * does not affect idempotency.
     */
    const canonicalPayload = {
      providerId: data.providerId,
      externalTransactionId: data.externalTransactionId,
      idempotencyKey: data.idempotencyKey,
      playerId: data.playerId,
      walletId: data.walletId,
      roundId: data.roundId,
      gameId: data.gameId,
      kind: data.kind,
      referenceExternalTransactionId:
        data.referenceExternalTransactionId ?? null,
      amount: data.money.amount,
      currency: data.money.currency,
    };

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(canonicalPayload))
      .digest('hex');

    return {
      providerId: data.providerId,
      externalTransactionId: data.externalTransactionId,
      idempotencyKey: data.idempotencyKey,
      payloadHash,
      walletId: data.walletId,
      playerId: data.playerId,
      roundId: data.roundId,
      gameId: data.gameId,
      kind: data.kind,
      referenceExternalTransactionId:
        data.referenceExternalTransactionId,
      amount: data.money.amount,
      currency: data.money.currency,
    };
  }

  private isRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.trim().length > 0
    );
  }

  private async getQueueUrl(): Promise<string> {
    if (this.queueUrl) {
      return this.queueUrl;
    }

    const result = await this.client.send(
      new GetQueueUrlCommand({
        QueueName: this.queueName,
      }),
    );

    if (!result.QueueUrl) {
      throw new Error(`SQS queue not found: ${this.queueName}`);
    }

    this.queueUrl = result.QueueUrl;
    return this.queueUrl;
  }
}