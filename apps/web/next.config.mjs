/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * دامنه‌های مجاز برای درخواست‌های حالت توسعه.
   * سرور توسعه در محیط پیش‌نمایش پشت پروکسی اجرا می‌شود و بدون این تنظیم،
   * نکست درخواست‌های با خاستگاه ناشناس را رد یا مسدود می‌کند.
   */
  allowedDevOrigins: ["*.e2b.app", "localhost"],
  /**
   * پروکسی هم‌مبدأ برای API. مرورگر درخواست‌های /api/* را به همان مبدأ وب می‌فرستد
   * و نکست آن‌ها را سمتِ سرور به بک‌اند (API_PROXY_TARGET، پیش‌فرض http://localhost:4000)
   * هدایت می‌کند. این دو مشکل را حل می‌کند: (۱) در محیط پیش‌نمایش/تولیدِ پشت پروکسی،
   * مرورگر هرگز localhost:4000 را مستقیم صدا نمی‌زند (که به بک‌اندِ واقعی نمی‌رسید و
   * ورود را می‌شکست)؛ (۲) چون درخواست از دیدِ مرورگر هم‌مبدأ است، نیازی به CORS نیست.
   * اگر NEXT_PUBLIC_API_URL ست شود، وب همان آدرس مطلق را مستقیم صدا می‌زند و این
   * پروکسی استفاده نمی‌شود (برای استقرارهایی با API روی دامنهٔ جدا).
   *
   * ⚠️ نکتهٔ حیاتیِ استقرار (TASK-19): Next.js این rewriteها را در زمانِ **build** در
   * .next/routes-manifest.json می‌پزد؛ مقدارِ process.env.API_PROXY_TARGET فقط هنگامِ
   * build خوانده می‌شود و تغییرِ آن در زمانِ اجرا (`next start`) اثری ندارد (برخلافِ
   * `next dev` که کانفیگ را دوباره می‌خواند). در Dockerfile به‌صورتِ build-arg پاس
   * داده می‌شود (پیش‌فرضِ compose: http://api:4000).
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
