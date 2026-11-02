-- POD تحویل: قرارداد openapi فیلدهای signature_url/photo_url را به‌صورت URI می‌خواهد.
-- جدول attachment برای فایل واقعی (S3/MinIO با storage_key/sha256/size_bytes) طراحی شده و
-- زیرساخت آپلود هنوز متصل نیست؛ برای ثبت مدرک تحویل از اپ موبایل (که ممکن است data-uri
-- یا مسیر CDN بفرستد) دو ستون متنی روی delivery افزوده می‌شود. ستون‌های FK به attachment
-- برای زمانی که پایپ‌لاین آپلود فایل کامل شد حفظ می‌شوند.
alter table delivery add column if not exists signature_url text;
alter table delivery add column if not exists photo_url     text;
