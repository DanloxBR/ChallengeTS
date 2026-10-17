
import { ConflictException, Injectable, NotFoundException,} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository,} from 'typeorm';

import { Money } from '../../domain/money';
import { Wallet, WalletState } from '../../domain/wallet';
import { WalletEntity } from './entities/wallet.entity';

@Injectable()
export class WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repository: Repository<WalletEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    return entity ? this.toDomain(entity) : null;
  }

  /**
   * Cria uma carteira nova.
   * Não deve ser usado para atualizar saldos existentes.
   */
  async save(wallet: Wallet): Promise<void> {
    const entity = this.repository.create({
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balanceCents: wallet.balance.toCents().toString(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    });

    await this.repository.insert(entity);
  }

  /**
   * Bloqueia a carteira durante a operação e persiste
   * as alterações dentro de uma transação PostgreSQL.
   */
  async withLockedWallet<T>(
    id: string,
    operation: (
      wallet: Wallet,
      manager: EntityManager,
    ) => Promise<T> | T,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WalletEntity);

      const entity = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!entity) {
        throw new NotFoundException(`Wallet ${id} not found`);
      }

      const wallet = this.toDomain(entity);
      const originalVersion = entity.version;

      const result = await operation(wallet, manager);

      const update = await repository.update(
        {
          id: entity.id,
          version: originalVersion,
        },
        {
          balanceCents: wallet.balance.toCents().toString(),
          version: wallet.version,
          updatedAt: wallet.updatedAt,
        },
      );

      if (update.affected !== 1) {
        throw new ConflictException(
          'Wallet was modified concurrently',
        );
      }

      return result;
    });
  }

  private toDomain(entity: WalletEntity): Wallet {
    const state: WalletState = {
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.fromCents(
        BigInt(entity.balanceCents),
        entity.currency,
      ),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    return Wallet.rehydrate(state);
  }
}