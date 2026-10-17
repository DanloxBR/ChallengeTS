
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialWageringSchema1792152000000
  implements MigrationInterface
{
  name = 'InitialWageringSchema1792152000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wallets (
        id VARCHAR(100) PRIMARY KEY,
        player_id VARCHAR(100) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        balance_cents BIGINT NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_wallet_balance_non_negative
          CHECK (balance_cents >= 0),
        CONSTRAINT chk_wallet_version_positive
          CHECK (version > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wallets_player_id
      ON wallets (player_id)
    `);

    await queryRunner.query(`
      CREATE TABLE wager_transactions (
        id VARCHAR(100) PRIMARY KEY,
        provider_id VARCHAR(100) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        payload_hash VARCHAR(255) NOT NULL,
        wallet_id VARCHAR(100) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        round_id VARCHAR(100) NOT NULL,
        game_id VARCHAR(100) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        amount_cents BIGINT NOT NULL,
        currency VARCHAR(10) NOT NULL,
        reference_external_transaction_id VARCHAR(255),
        reference_transaction_id VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        failure_code VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,

        CONSTRAINT fk_wager_wallet
          FOREIGN KEY (wallet_id) REFERENCES wallets(id),

        CONSTRAINT fk_wager_reference
          FOREIGN KEY (reference_transaction_id)
          REFERENCES wager_transactions(id),

        CONSTRAINT uq_wager_provider_external
          UNIQUE (provider_id, external_transaction_id),

        CONSTRAINT uq_wager_provider_idempotency
          UNIQUE (provider_id, idempotency_key),

        CONSTRAINT chk_wager_kind
          CHECK (kind IN (
            'OPENING', 'BET', 'WIN', 'LOSS',
            'REFUND', 'ROLLBACK'
          )),

        CONSTRAINT chk_wager_status
          CHECK (status IN (
            'PENDING', 'PENDING_REFERENCE', 'PROCESSED',
            'REJECTED', 'FAILED'
          )),

        CONSTRAINT chk_wager_amount_positive
          CHECK (amount_cents > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wager_wallet_created
      ON wager_transactions (wallet_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wager_status_created
      ON wager_transactions (status, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE wallet_ledger_entries (
        id VARCHAR(100) PRIMARY KEY,
        wallet_id VARCHAR(100) NOT NULL,
        transaction_id VARCHAR(100) NOT NULL,
        direction VARCHAR(10) NOT NULL,
        amount_cents BIGINT NOT NULL,
        currency VARCHAR(10) NOT NULL,
        balance_before_cents BIGINT NOT NULL,
        balance_after_cents BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_ledger_wallet
          FOREIGN KEY (wallet_id) REFERENCES wallets(id),

        CONSTRAINT fk_ledger_transaction
          FOREIGN KEY (transaction_id)
          REFERENCES wager_transactions(id),

        CONSTRAINT uq_ledger_transaction UNIQUE (transaction_id),

        CONSTRAINT chk_ledger_direction
          CHECK (direction IN ('DEBIT', 'CREDIT')),

        CONSTRAINT chk_ledger_amount_positive
          CHECK (amount_cents > 0),

        CONSTRAINT chk_ledger_balances_non_negative
          CHECK (
            balance_before_cents >= 0
            AND balance_after_cents >= 0
          ),

        CONSTRAINT chk_ledger_balanced
          CHECK (
            (direction = 'CREDIT'
              AND balance_after_cents =
                  balance_before_cents + amount_cents)
            OR
            (direction = 'DEBIT'
              AND balance_after_cents =
                  balance_before_cents - amount_cents)
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ledger_wallet_created
      ON wallet_ledger_entries (wallet_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id VARCHAR(100) PRIMARY KEY,
        aggregate_type VARCHAR(100) NOT NULL,
        aggregate_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(150) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        attempts INTEGER NOT NULL DEFAULT 0,

        CONSTRAINT chk_outbox_attempts_non_negative
          CHECK (attempts >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_pending
      ON outbox_events (created_at)
      WHERE published_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE inbox_messages (
        id VARCHAR(100) PRIMARY KEY,
        consumer_name VARCHAR(100) NOT NULL,
        message_id VARCHAR(255) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        CONSTRAINT uq_inbox_consumer_message
          UNIQUE (consumer_name, message_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE inbox_messages');
    await queryRunner.query('DROP TABLE outbox_events');
    await queryRunner.query('DROP TABLE wallet_ledger_entries');
    await queryRunner.query('DROP TABLE wager_transactions');
    await queryRunner.query('DROP TABLE wallets');
  }
}