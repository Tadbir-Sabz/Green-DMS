import { BadRequestException } from '@nestjs/common';
import type { ValidationPipeOptions } from '@nestjs/common';

/**
 * پیام فارسی به ازای هر validator در class-validator.
 * کلید دقیقاً نام constraint است که در `ValidationError.constraints` می‌آید
 * (مثلاً `@MaxLength(64)` → کلید `maxLength`).
 *
 * نکته: آرگومان‌های decorator (مثل عدد 64) روی خطا در دسترس نیستند؛ پس پیام‌ها
 * عمومی‌اند و نام فیلد را می‌آورند. validator پوشش‌داده‌نشده پیام انگلیسی اصلی
 * را نگه می‌دارد تا اطلاع از دست نرود.
 */
const MESSAGES_FA: Record<string, (property: string) => string> = {
  isDefined: (p) => `فیلد «${p}» الزامی است.`,
  isNotEmpty: (p) => `فیلد «${p}» نمی‌تواند خالی باشد.`,
  isString: (p) => `مقدار «${p}» باید متن (رشته) باشد.`,
  isBoolean: (p) => `مقدار «${p}» باید بولین (true/false) باشد.`,
  isInt: (p) => `مقدار «${p}» باید عدد صحیح باشد.`,
  isNumber: (p) => `مقدار «${p}» باید عدد باشد.`,
  isDecimal: (p) => `مقدار «${p}» باید عدد اعشاری معتبر باشد.`,
  isPositive: (p) => `مقدار «${p}» باید عددی مثبت باشد.`,
  isNegative: (p) => `مقدار «${p}» باید عددی منفی باشد.`,
  min: (p) => `مقدار «${p}» کمتر از حد مجاز است.`,
  max: (p) => `مقدار «${p}» بیشتر از حد مجاز است.`,
  minLength: (p) => `طول «${p}» از حداقل مجاز کوتاه‌تر است.`,
  maxLength: (p) => `طول «${p}» از حداکثر مجاز بیشتر است.`,
  isLength: (p) => `طول «${p}» خارج از محدوده مجاز است.`,
  // کلید واقعی class-validator برای @IsUUID برابر `isUuid` است (با Uid کوچک)
  isUuid: (p) => `مقدار «${p}» باید شناسه UUID معتبر باشد.`,
  isUUID: (p) => `مقدار «${p}» باید شناسه UUID معتبر باشد.`,
  isIn: (p) => `مقدار «${p}» خارج از مقادیر مجاز است.`,
  isEnum: (p) => `مقدار «${p}» خارج از مقادیر مجاز است.`,
  isDate: (p) => `مقدار «${p}» باید تاریخ معتبر باشد.`,
  isDateString: (p) => `مقدار «${p}» باید تاریخ به‌صورت رشته معتبر باشد.`,
  isEmail: (p) => `مقدار «${p}» باید ایمیل معتبر باشد.`,
  isUrl: (p) => `مقدار «${p}» باید نشانی (URL) معتبر باشد.`,
  isIP: (p) => `مقدار «${p}» باید نشانی IP معتبر باشد.`,
  isPhoneNumber: (p) => `شماره تماس «${p}» نامعتبر است.`,
  isMobilePhone: (p) => `شماره موبایل «${p}» نامعتبر است.`,
  isArray: (p) => `مقدار «${p}» باید آرایه باشد.`,
  arrayNotEmpty: (p) => `آرایه «${p}» نمی‌تواند خالی باشد.`,
  arrayMinSize: (p) => `تعداد اقلام «${p}» از حداقل مجاز کمتر است.`,
  arrayMaxSize: (p) => `تعداد اقلام «${p}» از حداکثر مجاز بیشتر است.`,
  isObject: (p) => `مقدار «${p}» باید شیء باشد.`,
  matches: (p) => `قالب مقدار «${p}» نامعتبر است.`,
  equals: (p) => `مقدار «${p}» باید برابر مقدار خواسته‌شده باشد.`,
  notEquals: (p) => `مقدار «${p}» مقدار ممنوعی است.`,
  unknownProperty: (p) => `فیلد «${p}» در قرارداد تعریف نشده است.`,
};

/** پیام فارسی validator؛ برای کلید ناشناخته، پیام اصلی class-validator برمی‌گردد */
const toPersianMessage = (constraintKey: string, property: string, fallback: string): string =>
  MESSAGES_FA[constraintKey]?.(property) ?? fallback;

/**
 * تنظیمات اعتبارسنجی سراسری — هم در main.ts و هم در تست‌ها استفاده می‌شود
 * تا پاسخ خطای اعتبارسنجی، قرارداد Error (code + message_fa + details فارسی)
 * را رعایت کند.
 */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  transform: true,
  stopAtFirstError: true,
  exceptionFactory: (errors) => {
    const details: Record<string, string[]> = {};
    for (const err of errors) {
      const field = err.property;
      const constraints = err.constraints ?? {};
      const messages = Object.entries(constraints).map(([key, fallback]) =>
        toPersianMessage(key, field, fallback),
      );
      // برای خطاهای تو در تو (validateNested) که constraint مستقیم ندارند
      details[field] = messages.length ? messages : [`مقدار «${field}» نامعتبر است.`];
    }
    return new BadRequestException({
      code: 'validation_failed',
      message_fa: 'درخواست نامعتبر است؛ فیلدهای مشخص‌شده را بررسی کنید.',
      details: { fields: details },
    });
  },
};
