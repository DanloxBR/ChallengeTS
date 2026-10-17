
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, } from 'class-validator';
import { WagerTransactionKind } from '../../../domain/wager-transaction';

export class ProcessBetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  payloadHash!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  gameId!: string;

  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  referenceExternalTransactionId?: string;

  @IsString()
  @Matches(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}