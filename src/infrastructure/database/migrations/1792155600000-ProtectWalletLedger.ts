
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectWalletLedger1792155600000
  implements MigrationInterface
{
  name = 'ProtectWalletLedger1792155600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION prevent_wallet_ledger_mutation()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION
          'Wallet ledger entries are immutable';
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_wallet_ledger_immutable
      BEFORE UPDATE OR DELETE ON wallet_ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_wallet_ledger_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER trg_wallet_ledger_immutable
      ON wallet_ledger_entries
    `);

    await queryRunner.query(`
      DROP FUNCTION prevent_wallet_ledger_mutation()
    `);
  }
}