/**
 * اعتبارسنجیِ «محتوای واقعی» فایلِ ضمیمه بر پایهٔ امضای بایتی (magic bytes).
 *
 * چرا: پیش از این فقط `file.mimetype` بررسی می‌شد که کاملاً از سویِ کلاینت
 * تأمین می‌شود (مرورگر آن را از پسوندِ نام فایل حدس می‌زند). یعنی مهاجم می‌توانست
 * یک فایلِ HTML/PHP/اجرایی را با ادعایِ image/png آپلود کند و در آبجکت‌استوریج بنشاند.
 * این ماژول محتوای بایتی را مستقل از ادعایِ کلاینت تشخیص می‌دهد و ناسازگاری را رد می‌کند.
 *
 * اصلِ حاکم: fail-closed. اگر نوعی قابلِ راستی‌آزمایی با امضا نباشد، پذیرفته نمی‌شود
 * (نه اینکه با اعتماد به ادعایِ کلاینت عبور کند).
 *
 * هیچ وابستگیِ خارجی ندارد — فقط Buffer.
 */

/** انواعی که امضایِ بایتیِ قابلِ اتکا دارند. */
export const VERIFIABLE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type VerifiableMimeType = (typeof VERIFIABLE_MIME_TYPES)[number];

/** پسوندهایِ پذیرفته‌شده برای هر نوع (برای سنجشِ هم‌خوانیِ نامِ فایل). */
const EXTENSIONS: Record<VerifiableMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ascii(buf: Buffer, start: number, len: number): string {
  return buf.subarray(start, start + len).toString('latin1');
}

/**
 * تشخیصِ نوع از رویِ بایت‌ها. `null` یعنی محتوایِ ناشناخته.
 * علاوه بر امضا، حداقلِ ساختار هم سنجیده می‌شود تا فایلِ «نیمه‌ساخته/جعلی»
 * که فقط چند بایتِ اولِ یک امضایِ معتبر دارد رد شود.
 */
export function detectMimeType(buf: Buffer): VerifiableMimeType | null {
  if (!buf || buf.length < 12) return null;

  // JPEG — FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG — امضای ۸ بایتی + نخستین chunk باید IHDR باشد (حداقل طولِ ساختاری ۳۳)
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (buf.length < 33) return null; // مخدوش/بریده: امضا هست ولی IHDR کامل نیست
    if (ascii(buf, 12, 4) !== 'IHDR') return null;
    return 'image/png';
  }

  // WEBP — RIFF....WEBP + یکی از fourCCهای VP8/VP8L/VP8X
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    const fourcc = ascii(buf, 12, 4);
    if (fourcc !== 'VP8 ' && fourcc !== 'VP8L' && fourcc !== 'VP8X') return null;
    return 'image/webp';
  }

  // PDF — «%PDF-» باید در ۱۰۲۴ بایتِ نخست باشد (برخی فایل‌ها prefix زباله دارند)
  const head = buf.subarray(0, Math.min(buf.length, 1024));
  if (head.indexOf('%PDF-') !== -1) {
    return 'application/pdf';
  }

  return null;
}

/** شناساییِ محتوایِ پرخطر برای گزارشِ دقیق‌تر (نه برای پذیرش). */
export function detectSuspiciousKind(buf: Buffer): string | null {
  if (!buf || buf.length === 0) return null;
  const head = buf.subarray(0, Math.min(buf.length, 512)).toString('latin1');
  if (buf[0] === 0x4d && buf[1] === 0x5a) return 'windows-executable(MZ)';
  if (buf[0] === 0x7f && ascii(buf, 1, 3) === 'ELF') return 'elf-executable';
  if (/^\s*<\?php/i.test(head)) return 'php-source';
  if (/^\s*(<!doctype html|<html|<script)/i.test(head)) return 'html-or-script';
  if (head.includes('<svg')) return 'svg(may embed script)';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip-or-office-container';
  if (buf[0] === 0x1f && buf[1] === 0x8b) return 'gzip';
  return null;
}

/** پسوندِ نامِ فایل (بدونِ نقطه، کوچک) یا null. */
export function extensionOf(fileName: string): string | null {
  const name = (fileName ?? '').trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : null;
}

export type ContentRejectionReason =
  /** نوعِ اعلامی هیچ امضایِ قابلِ راستی‌آزمایی ندارد → fail-closed */
  | 'unverifiable_content_type'
  /** محتوایِ واقعی با نوعِ اعلامی نمی‌خواند (جعلِ MIME) */
  | 'content_type_mismatch'
  /** امضا هست ولی ساختارِ فایل ناقص است */
  | 'malformed_content'
  /** پسوندِ نامِ فایل با محتوایِ واقعی نمی‌خواند */
  | 'extension_mismatch';

export interface ContentCheckResult {
  ok: boolean;
  reason?: ContentRejectionReason;
  /** نوعِ تشخیص‌داده‌شده از رویِ بایت‌ها (برای ذخیره/گزارش) */
  detected: VerifiableMimeType | null;
  /** برچسبِ محتوایِ پرخطرِ تشخیص‌داده‌شده (اختیاری، برای لاگ) */
  suspicious?: string | null;
  /** پسوندهایِ مجاز برای نوعِ تشخیص‌داده‌شده (برای پیامِ خطا) */
  expectedExtensions?: readonly string[];
}

/**
 * راستی‌آزماییِ کامل: نوعِ اعلامی باید قابلِ راستی‌آزمایی باشد، محتوایِ واقعی باید
 * با آن بخواند، و پسوندِ نامِ فایل باید با محتوایِ واقعی سازگار باشد.
 *
 * @param buf            بایت‌هایِ فایل
 * @param declaredMime   نوعِ اعلام‌شده از سویِ کلاینت (غیرقابلِ اعتماد)
 * @param fileName       نامِ اصلیِ فایل (برای سنجشِ پسوند)
 */
export function checkFileContent(
  buf: Buffer,
  declaredMime: string,
  fileName: string,
): ContentCheckResult {
  const declared = (declaredMime ?? '').trim().toLowerCase();
  const suspicious = detectSuspiciousKind(buf);

  const verifiable = (VERIFIABLE_MIME_TYPES as readonly string[]).includes(declared);
  if (!verifiable) {
    return { ok: false, reason: 'unverifiable_content_type', detected: null, suspicious };
  }

  const detected = detectMimeType(buf);

  // امضا پیدا نشد: یا محتوا چیزِ دیگری است یا ساختارش ناقص.
  if (!detected) {
    return {
      ok: false,
      reason: suspicious ? 'content_type_mismatch' : 'malformed_content',
      detected: null,
      suspicious,
    };
  }

  if (detected !== declared) {
    return {
      ok: false,
      reason: 'content_type_mismatch',
      detected,
      suspicious,
      expectedExtensions: EXTENSIONS[detected],
    };
  }

  const ext = extensionOf(fileName);
  const allowed = EXTENSIONS[detected];
  // اگر پسوندی موجود باشد باید با محتوایِ واقعی بخواند؛ نبودِ پسوند خطا نیست.
  if (ext && !allowed.includes(ext)) {
    return {
      ok: false,
      reason: 'extension_mismatch',
      detected,
      suspicious,
      expectedExtensions: allowed,
    };
  }

  return { ok: true, detected, suspicious };
}
