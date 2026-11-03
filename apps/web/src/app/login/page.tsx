'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, loadSessionContext, setSession } from '@/lib/api';

/**
 * صفحه ورود — سه روش طبق قرارداد (openapi › /auth):
 *   POST /auth/login           ورود با نام کاربری/رمز
 *   POST /auth/otp/request     درخواست کد یک‌بارمصرف پیامکی (202 — پاسخ عامدانه یکسان)
 *   POST /auth/otp/verify      تأیید کد و صدور نشست (401/423/429 با پیام فارسی قرارداد)
 *   POST /auth/password-reset  بازیابی رمز با کدِ دلیل password_reset (204؛ نشستی صادر نمی‌شود)
 */
type Mode = 'password' | 'otp' | 'reset';
type OtpPurpose = 'login' | 'password_reset';

/** فاصله حداقلی دو ارسال کد (OTP_RESEND_SECONDS سرور، پیش‌فرض ۶۰ ثانیه) */
const RESEND_SECONDS = 60;

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // شمارش معکوس ارسال مجدد کد
  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown]);

  const switchMode = (next: Mode): void => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  /**
   * POST /auth/otp/request — پاسخ 202 یعنی کد ارسال شد (یا بی‌اثر بود، بدون لو رفتن وجود حساب).
   * هر تب دلیل خودش را می‌فرستد: ورود ← login، بازیابی رمز ← password_reset.
   */
  const requestCode = async (purpose: OtpPurpose): Promise<void> => {
    if (!username.trim()) {
      setError(
        purpose === 'login'
          ? 'برای درخواست کد، ابتدا نام کاربری را وارد کنید.'
          : 'برای بازیابی رمز، ابتدا نام کاربری را وارد کنید.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: apiError } = await api.POST('/auth/otp/request', {
      body: { username: username.trim(), purpose },
    });
    setBusy(false);
    if (apiError) {
      setError(errorMessage(apiError));
      return;
    }
    if (purpose === 'login') setCodeSent(true);
    else setResetSent(true);
    setCooldown(RESEND_SECONDS);
    setNotice(
      purpose === 'login'
        ? 'کد پیامک شد؛ کد ۶ رقمی را در فیلد زیر وارد کنید.'
        : 'کد بازیابی پیامک شد؛ کد و رمز عبور جدید را وارد کنید.',
    );
  };

  /** POST /auth/otp/verify — تأیید کد و ورود با همان نشست صادرشده */
  const verifyCode = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: apiError } = await api.POST('/auth/otp/verify', {
      body: { username: username.trim(), code: code.trim() },
    });
    setBusy(false);
    if (apiError || !data) {
      setError(errorMessage(apiError));
      return;
    }
    setSession(data.access_token, data.user.username, data.refresh_token, data.expires_in);
    // نقش‌ها/مجوزها را از /auth/me بگیر و در dms_user ذخیره کن تا RoleGuard/منو کار کنند
    await loadSessionContext();
    router.push('/products');
  };

  /** POST /auth/password-reset — بازیابی رمز با کد پیامکی؛ در پایان به تب ورود برمی‌گردیم */
  const submitReset = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!resetSent) {
      setError('ابتدا کد بازیابی را درخواست دهید؛ کد به موبایل ثبت‌شده پیامک می‌شود.');
      return;
    }
    if (newPassword.length < 8) {
      setError('رمز عبور جدید باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: apiError } = await api.POST('/auth/password-reset', {
      body: { username: username.trim(), code: code.trim(), new_password: newPassword },
    });
    setBusy(false);
    if (apiError) {
      setError(errorMessage(apiError));
      return;
    }
    // 204 یعنی رمز عوض شد و همه نشست‌های باز بسته شدند؛ ورود با رمز تازه
    setMode('password');
    setPassword('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetSent(false);
    setNotice('رمز عبور با موفقیت عوض شد؛ حالا با رمز تازه وارد شوید.');
  };

  /** POST /auth/login — ورود با رمز عبور */
  const submitPassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: apiError } = await api.POST('/auth/login', {
      body: { username, password },
    });
    setBusy(false);
    if (apiError || !data) {
      setError(errorMessage(apiError));
      return;
    }
    setSession(data.access_token, data.user.username, data.refresh_token, data.expires_in);
    // نقش‌ها/مجوزها را از /auth/me بگیر و در dms_user ذخیره کن تا RoleGuard/منو کار کنند
    await loadSessionContext();
    router.push('/products');
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-line-strong px-3 py-2 focus:border-info focus:outline-none';

  const tabClass = (active: boolean): string =>
    `rounded-md px-3 py-1.5 font-medium transition ${
      active ? 'bg-surface text-info-ink shadow' : 'text-ink-muted'
    }`;

  const modeTitle =
    mode === 'password'
      ? 'نام کاربری و رمز عبور خود را وارد کنید'
      : mode === 'otp'
        ? 'کد یک‌بارمصرف پیامکی را وارد کنید'
        : 'کد بازیابی را درخواست و رمز عبور جدید را تعیین کنید';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-alt p-4">
      <form
        onSubmit={
          mode === 'password' ? submitPassword : mode === 'otp' ? verifyCode : submitReset
        }
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold">ورود به سامانه پخش مویرگی</h1>
        <p className="mt-1 text-sm text-ink-muted">{modeTitle}</p>

        {/* انتخاب روش */}
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-surface-alt p-1 text-sm">
          <button type="button" onClick={() => switchMode('password')} className={tabClass(mode === 'password')}>
            رمز عبور
          </button>
          <button type="button" onClick={() => switchMode('otp')} className={tabClass(mode === 'otp')}>
            کد پیامکی
          </button>
          <button type="button" onClick={() => switchMode('reset')} className={tabClass(mode === 'reset')}>
            بازیابی رمز
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium">
          نام کاربری
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {mode === 'password' && (
          <label className="mt-4 block text-sm font-medium">
            رمز عبور
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}

        {mode === 'otp' && (
          <>
            <div className="mt-4 flex items-end gap-2">
              <label className="block flex-1 text-sm font-medium">
                کد پیامکی
                <input
                  className={inputClass}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder={codeSent ? 'کد ۶ رقمی' : 'ابتدا درخواست کد دهید'}
                  required
                />
              </label>
              <button
                type="button"
                onClick={() => void requestCode('login')}
                disabled={busy || cooldown > 0}
                className="mb-0.5 shrink-0 rounded-lg border border-info px-3 py-2 text-sm font-medium text-info-ink hover:bg-info-soft disabled:opacity-50"
              >
                {cooldown > 0
                  ? `ارسال مجدد (${cooldown})`
                  : codeSent
                    ? 'ارسال دوباره'
                    : 'درخواست کد'}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              کد به شماره موبایل ثبت‌شدهٔ شما پیامک می‌شود و تا ۲ دقیقه معتبر است.
            </p>
          </>
        )}

        {mode === 'reset' && (
          <>
            <div className="mt-4 flex items-end gap-2">
              <label className="block flex-1 text-sm font-medium">
                کد بازیابی پیامکی
                <input
                  className={inputClass}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder={resetSent ? 'کد ۶ رقمی' : 'ابتدا درخواست کد دهید'}
                  required
                />
              </label>
              <button
                type="button"
                onClick={() => void requestCode('password_reset')}
                disabled={busy || cooldown > 0}
                className="mb-0.5 shrink-0 rounded-lg border border-info px-3 py-2 text-sm font-medium text-info-ink hover:bg-info-soft disabled:opacity-50"
              >
                {cooldown > 0
                  ? `ارسال مجدد (${cooldown})`
                  : resetSent
                    ? 'ارسال دوباره'
                    : 'درخواست کد'}
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium">
              رمز عبور جدید
              <input
                type="password"
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              تکرار رمز عبور جدید
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <p className="mt-2 text-xs text-ink-muted">
              کد به موبایل ثبت‌شدهٔ شما پیامک می‌شود (تا ۲ دقیقه معتبر)؛ پس از تغییر رمز،
              همه نشست‌های باز شما بسته می‌شود.
            </p>
          </>
        )}

        {notice && (
          <p className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-soft-ink">{notice}</p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-info px-4 py-2 font-medium text-white hover:bg-info disabled:opacity-50"
        >
          {busy
            ? 'در حال پردازش…'
            : mode === 'password'
              ? 'ورود'
              : mode === 'otp'
                ? 'ورود با کد'
                : 'تغییر رمز عبور'}
        </button>

        <p className="mt-4 text-center text-xs text-ink-subtle">دمو: admin / Admin@1234</p>
      </form>
    </main>
  );
}
