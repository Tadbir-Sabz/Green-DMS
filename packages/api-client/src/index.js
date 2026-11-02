import createClient from 'openapi-fetch';
/**
 * مسیرهای اعتبارنامه‌ای که 401شان یعنی اطلاعات واردشده درست نیست، نه انقضای نشست؛
 * این‌ها هرگز تازه نمی‌شوند (وگرنه ورود اشتباه با refresh حلقه می‌زند).
 * برعکس /auth/me و /auth/logout نشست‌خوان هستند و 401شان باید با refresh تازه شود
 * تا کاربرِ بیش از ۱۵ دقیقه بی‌کار بی‌دلیل از سیستم خارج نشود.
 */
const NO_REFRESH_PATHS = [
    '/auth/login',
    '/auth/otp/request',
    '/auth/otp/verify',
    '/auth/password-reset',
    '/auth/refresh', // خودِ تازه‌سازی با fetch خام انجام می‌شود؛ تازه‌سازیِ دوباره‌اش حلقه است
];
const canRefreshUrl = (url) => {
    try {
        const pathname = new URL(url).pathname;
        return !NO_REFRESH_PATHS.some((p) => pathname.endsWith(p));
    }
    catch {
        return false;
    }
};
/** ساخت کلاینت؛ هر بار با تغییر نشست، getToken را به‌روز نگه دارید */
export function createApiClient(options) {
    const clientOptions = {
        baseUrl: options.baseUrl,
        // openapi-fetch 0.17 گزینه headers را ثابت نگه می‌دارد؛ توکن نشست با fetch
        // سفارشی روی هر درخواست ست می‌شود تا با تغییر نشست همیشه تازه بماند.
        fetch: async (request) => {
            const currentToken = () => options.getToken?.() ?? null;
            const withToken = (req) => {
                const token = currentToken();
                if (!token)
                    return req;
                const headers = new Headers(req.headers);
                headers.set('Authorization', `Bearer ${token}`);
                return new Request(req, { headers });
            };
            // کپی درخواست پیش از اولین ارسال: بدنهٔ درخواست مصرف‌شدنی است و فقط
            // یک بار می‌توان آن را با توکن تازه دوباره فرستاد
            const canRetry = Boolean(options.refresh) && canRefreshUrl(request.url);
            const replay = canRetry ? request.clone() : null;
            // توکنِ همین ارسال — برای refresh می‌گوید آیا تب دیگری نشست را وسطِ کار عوض کرده است
            const tokenSent = currentToken();
            let response = await fetch(withToken(request));
            if (response.status === 401 &&
                replay &&
                options.refresh &&
                (await options.refresh({ tokenSent }))) {
                response = await fetch(withToken(replay));
            }
            return response;
        },
    };
    return createClient(clientOptions);
}
