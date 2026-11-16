import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** POST /customers/{id}/credit/hold — دلیلِ مسدودی الزامی است (ممیزی) */
export class SetCreditHoldDto {
  @IsDefined()
  @IsString()
  @MinLength(3, { message: 'دلیل مسدودی اعتبار الزامی است (دست‌کم ۳ کاراکتر).' })
  @MaxLength(500)
  reason!: string;
}

/** POST /customers/{id}/credit/release — یادداشت اختیاری (برای ممیزی) */
export class ReleaseCreditHoldDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
