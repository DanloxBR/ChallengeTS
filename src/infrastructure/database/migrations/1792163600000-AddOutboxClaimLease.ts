
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxClaimLease1792163600000
  implements MigrationInterface
{
  name = 'AddOutboxClaimLease1792163600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox_events
      ADD COLUMN claimed_by varchar(100) NULL,
      ADD COLUMN claim_until timestamptz NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_claimable
      ON outbox_events (created_at, id)
      WHERE published_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_outbox_claimable
    `);

    await queryRunner.query(`
      ALTER TABLE outbox_events
      DROP COLUMN IF EXISTS claim_until,
      DROP COLUMN IF EXISTS claimed_by
    `);
  }
}