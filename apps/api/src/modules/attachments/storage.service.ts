import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'minio';

/** پیکربندی ذخیره‌سازی شیء — از متغیرهای محیطی MINIO_* (سازگار با هر S3-compatible) */
export interface ObjectStorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

/**
 * لایهٔ ذخیره‌سازی شیء (MinIO/S3) برای ضمیمه‌ها و مدرک تحویل (POD).
 *
 * نکات طراحی:
 * - کلاینت به‌صورت تنبل (lazy) ساخته می‌شود تا اگر MinIO در لحظهٔ boot در دسترس نبود،
 *   برنامه بالا بیاید و فقط همان درخواستِ آپلود/دریافت با خطای ساختاریافته شکست بخورد.
 * - اگر MINIO_* تنظیم نشده باشد، «fail-closed» با 503 و پیام فارسی (نه ذخیرهٔ ناامن روی دیسک).
 * - فایل‌ها فقط در آبجکت‌استوریج نگهداری می‌شوند؛ در جدول attachment تنها «storage_key»
 *   و metadate ثبت می‌شود (هرگز خودِ بایت‌ها در DB) — هم‌راستا با comment جدول در مهاجرت 0002.
 * - دانلود با URL امضاشدهٔ کوتاه‌عمر (presigned) انجام می‌شود تا bucket عمومی نباشد.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private cachedClient?: Client;
  private cachedConfig?: ObjectStorageConfig;

  /** خواندن و اعتبارسنجی پیکربندی از env؛ کش می‌شود. در صورت نقص → 503 ساختاریافته. */
  config(): ObjectStorageConfig {
    if (this.cachedConfig) return this.cachedConfig;

    const endpoint = (process.env.MINIO_ENDPOINT ?? '').trim();
    const accessKey = (process.env.MINIO_ACCESS_KEY ?? '').trim();
    const secretKey = (process.env.MINIO_SECRET_KEY ?? '').trim();
    const bucket = (process.env.MINIO_BUCKET ?? '').trim() || 'greendms';

    if (!endpoint || !accessKey || !secretKey) {
      throw new ServiceUnavailableException({
        code: 'storage_not_configured',
        message_fa: 'ذخیره‌سازی شیء (MinIO/S3) پیکربندی نشده است؛ آپلود ممکن نیست.',
      });
    }

    // endpoint می‌تواند «host» یا «host:port» باشد (مانند minio:9000 در docker-compose)
    const [host, portFromHost] = endpoint.includes(':') ? endpoint.split(':') : [endpoint, ''];
    const envSsl = (process.env.MINIO_USE_SSL ?? '').trim().toLowerCase();
    const portRaw = (process.env.MINIO_PORT ?? portFromHost ?? '').trim();
    const port = Number(portRaw !== '' ? portRaw : envSsl === 'true' ? 443 : 9000);
    const useSSL = envSsl === 'true' || port === 443;
    const region = (process.env.MINIO_REGION ?? '').trim() || undefined;

    this.cachedConfig = { endPoint: host, port, useSSL, accessKey, secretKey, bucket, region };
    return this.cachedConfig;
  }

  private getClient(): Client {
    if (!this.cachedClient) {
      const c = this.config();
      this.cachedClient = new Client({
        endPoint: c.endPoint,
        port: c.port,
        useSSL: c.useSSL,
        accessKey: c.accessKey,
        secretKey: c.secretKey,
        ...(c.region ? { region: c.region } : {}),
      });
    }
    return this.cachedClient;
  }

  /** ذخیرهٔ یک شیء؛ Content-Type ست می‌شود تا هنگام دانلود درست سرو شود. */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { bucket } = this.config();
    await this.getClient().putObject(bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
    this.logger.log(`stored ${key} (${body.length} bytes) in bucket "${bucket}"`);
  }

  /** URL امضاشدهٔ GET با عمر کوتاه (پیش‌فرض ۵ دقیقه) برای دانلود امن بدون bucket عمومی. */
  async presignedGet(key: string, expiresInSeconds = 300): Promise<string> {
    const { bucket } = this.config();
    return this.getClient().presignedGetObject(bucket, key, expiresInSeconds);
  }

  /** حذف شیء (برای پاک‌سازی ضمیمهٔ لغوشده). */
  async remove(key: string): Promise<void> {
    const { bucket } = this.config();
    await this.getClient().removeObject(bucket, key);
  }
}
