
import { Injectable, Logger, OnModuleDestroy, OnModuleInit,} from '@nestjs/common';
import { WageringService } from '../../application/wagering/wagering.service';

@Injectable()
export class PendingReferenceWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    PendingReferenceWorkerService.name,
  );

  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly wageringService: WageringService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runSafely();
    }, 5000);

// Executa uma verificação ao iniciar a aplicação.
// e agenda verificações periódicas a cada 5 segundos.
    void this.runSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async runSafely(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.wageringService.retryPendingReferences();
    } catch (error: unknown) {
      this.logger.error(
        'Falha ao reprocessar transações com referência pendente',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}