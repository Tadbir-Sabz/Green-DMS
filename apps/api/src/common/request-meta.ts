import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** متادیتای درخواست برای ممیزی — بدون وابستگی به types اکسپرس */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const headerString = (value: string | string[] | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

interface RawRequest {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  request_id?: string;
}

/** استخراج متادیتای ممیزی از یک درخواست HTTP */
export function extractRequestMeta(req: RawRequest | undefined): RequestMeta {
  const headers = req?.headers ?? {};
  return {
    ip: req?.ip ?? headerString(headers['x-forwarded-for'])?.split(',')[0]?.trim() ?? null,
    userAgent: headerString(headers['user-agent']),
    requestId: req?.request_id ?? headerString(headers['x-request-id']),
  };
}

/**
 * دکوراتور @RequestMeta() — متادیتای ممیزی (ip/user-agent/request_id) را در
 * کنترلر فراهم می‌کند تا سرویس‌ها رویداد را در audit_log بنویسند.
 */
export const RequestMetaParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta =>
    extractRequestMeta(ctx.switchToHttp().getRequest<RawRequest>()),
);
