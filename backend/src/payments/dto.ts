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

/** Body for POST /pay — same params as GET, then redirect to GET /pay */
export class PaymentPostBodyDto {
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

/** Body for POST /pay/set-method — set selected payment type before confirm */
export class SetPaymentMethodDto {
  @IsString()
  paymentIntentId!: string;

  @IsString()
  paymentType!: string;
}
