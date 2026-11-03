/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * دامنه‌های مجاز برای درخواست‌های حالت توسعه.
   * سرور توسعه در محیط پیش‌نمایش پشت پروکسی اجرا می‌شود و بدون این تنظیم،
   * نکست درخواست‌های با خاستگاه ناشناس را رد یا مسدود می‌کند.
   */
  allowedDevOrigins: ["*.e2b.app", "localhost"],
};

export default nextConfig;
