
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWageringIntegrityConstraints1792160000000
  implements MigrationInterface
{
  name = 'AddWageringIntegrityConstraints1792160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
// Um jogador deve possuir apenas uma carteira por moeda.
    await queryRunner.query(`
      ALTER TABLE wallets
      ADD CONSTRAINT uq_wallet_player_currency
      UNIQUE (player_id, currency)
    `);

// Facilita a localização de transações de referência.
    await queryRunner.query(`
      CREATE INDEX idx_wager_provider_reference
      ON wager_transactions (
        provider_id,
        reference_external_transaction_id
      )
      WHERE reference_external_transaction_id IS NOT NULL
    `);

// Impede repetir o mesmo tipo de reversão para uma referência.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_wager_reference_reversal_kind
      ON wager_transactions (
        provider_id,
        reference_external_transaction_id,
        kind
      )
      WHERE kind IN ('REFUND', 'ROLLBACK')
        AND reference_external_transaction_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wager_reference_reversal_kind
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wager_provider_reference
    `);

    await queryRunner.query(`
      ALTER TABLE wallets
      DROP CONSTRAINT IF EXISTS uq_wallet_player_currency
    `);
  }
}