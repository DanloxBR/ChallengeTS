
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingReferenceRetry1792167200000
  implements MigrationInterface
{
  name = 'AddPendingReferenceRetry1792167200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wager_transactions
      ADD COLUMN reference_attempts INTEGER NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE wager_transactions
      ADD COLUMN reference_next_attempt_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wager_pending_reference_retry
      ON wager_transactions (
        status,
        reference_next_attempt_at,
        created_at
      )
      WHERE status = 'PENDING_REFERENCE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wager_pending_reference_retry
    `);

    await queryRunner.query(`
      ALTER TABLE wager_transactions
      DROP COLUMN IF EXISTS reference_next_attempt_at
    `);

    await queryRunner.query(`
      ALTER TABLE wager_transactions
      DROP COLUMN IF EXISTS reference_attempts
    `);
  }
}