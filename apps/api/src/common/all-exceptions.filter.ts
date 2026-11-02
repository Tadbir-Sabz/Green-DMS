import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** کد پیش‌فرض برای هر status — وقتی خودِ exception کد نیاورده باشد */
const STATUS_CODE: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'payment_required',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'unprocessable_entity',
  429: 'too_many_requests',
  500: 'internal_error',
  501: 'not_implemented',
  502: 'bad_gateway',
  503: 'service_unavailable',
  504: 'gateway_timeout',
};

/** پیام فارسی پیش‌فرض — وقتی exception پیام فارسی نداشته باشد */
const STATUS_MESSAGE_FA: Record<number, string> = {
  400: 'درخواست نامعتبر است؛ فیلدهای ارسالی را بررسی کنید.',
  401: 'ابتدا وارد شوید؛ توکن دسترسی ارسال یا معتبر نیست.',
  402: 'پرداخت لازم است؛ اعتبار یا سقف تعریف‌نشده است.',
  403: 'دسترسی مجاز نیست؛ مجوز لازم را ندارید.',
  404: 'منبع درخواستی یافت نشد.',
  405: 'روش درخواست برای این مسیر مجاز نیست.',
  409: 'درخواست با دادهٔ فعلی سازگار نیست؛ وضعیت یا شناسه تکراری است.',
  413: 'حجم درخواست بیش از حد مجاز است.',
  415: 'نوع محتوای ارسال‌شده پشتیبانی نمی‌شود.',
  422: 'درخواست از نظر قواعد کسب‌وکار قابل اجرا نیست.',
  429: 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.',
  500: 'خطای داخلی رخ داد؛ دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
  503: 'سرویس موقتاً در دسترس نیست.',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * فیلتر سراسری خطا — قرارداد Error (openapi › components.schemas.Error):
 * هر پاسخ خطای HTTP دقیقاً { code, message_fa, details?, request_id } است.
 *
 * - HttpExceptionهای ساخت‌یافته (مانند خطاهای ماژول‌ها و ValidationPipe) همان
 *   code/message_fa/details خود را نگه می‌دارند و فقط request_id می‌گیرند؛
 * - استثناهای بدون ساختار (باگ، خطای دیتابیس…) به 500 با کد عمومی
 *   internal_error تبدیل می‌شوند؛ جزئیات داخلی فقط در سمت سرور لاگ می‌شود
 *   تا اطلاعات فنی به کلاینت نشت نکند؛
 * - request_id هدر x-request-id پاسخ را هم پر می‌کند تا لاگ سرور و پاسخ کلاینت
 *   با هم قابل تطبیق باشند.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<{
      status(n: number): { json(body: unknown): unknown };
      setHeader(k: string, v: string): unknown;
    }>();
    const req = ctx.getRequest<{ request_id?: string; method?: string; url?: string }>();
    const requestId = req.request_id ?? randomUUID();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let messageFa = STATUS_MESSAGE_FA[HttpStatus.INTERNAL_SERVER_ERROR] as string;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const source = isPlainObject(body) ? body : { message: String(body) };

      if (typeof source.code === 'string' && source.code) code = source.code;
      else code = STATUS_CODE[status] ?? (status >= 500 ? 'internal_error' : 'bad_request');

      if (typeof source.message_fa === 'string' && source.message_fa) {
        messageFa = source.message_fa;
      } else if (typeof source.message === 'string' && source.message) {
        // پیام انگلیسی Nest فقط وقتی ترجمه‌ای موجود نیست عبور داده می‌شود
        messageFa = STATUS_MESSAGE_FA[status] ?? source.message;
      } else {
        messageFa = STATUS_MESSAGE_FA[status] ?? 'درخواست قابل پردازش نیست.';
      }

      if (source.details !== undefined) details = source.details;

      if (status >= 500) {
        this.logger.error(
          `${req.method ?? ''} ${req.url ?? ''} → ${status} ${code}: ${exception.message}`,
          exception.stack,
          { request_id: requestId },
        );
      }
    } else {
      // خطای پیش‌بینی‌نشده: هویت داخلی فقط در لاگ سرور
      this.logger.error(
        `${req.method ?? ''} ${req.url ?? ''} → 500 internal_error`,
        exception instanceof Error ? exception.stack : String(exception),
        { request_id: requestId },
      );
    }

    try {
      res.setHeader('x-request-id', requestId);
    } catch {
      // پاسخ شاید از قبل بسته شده باشد؛ نباید فیلتر خودش خطا دهد
    }

    res.status(status).json(
      details === undefined
        ? { code, message_fa: messageFa, request_id: requestId }
        : { code, message_fa: messageFa, details, request_id: requestId },
    );
  }
}
