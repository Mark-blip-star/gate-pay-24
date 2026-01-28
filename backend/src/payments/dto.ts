import { IsOptional, IsString } from 'class-validator';

export class PaymentQueryDto {
  @IsOptional()
  @IsString()
  public_key?: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsString()
  sum?: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sign?: string;

  @IsOptional()
  @IsString()
  ordernum?: string;

  @IsOptional()
  @IsString()
  paySystem?: string;
}
