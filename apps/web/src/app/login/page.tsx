'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, loadSessionContext, setSession } from '@/lib/api';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLock,
  IconPhone,
  IconShield,
  IconTracking,
  IconUser,
} from '@/components/icons';

/**
 * صفحه ورود — سه روش طبق قرارداد (openapi › /auth):
 *   POST /auth/login           ورود با نام کاربری/رمز
 *   POST /auth/otp/request     درخواست کد یک‌بارمصرف پیامکی (202 — پاسخ عامدانه یکسان)
 *   POST /auth/otp/verify      تأیید کد و صدور نشست (401/423/429 با پیام فارسی قرارداد)
 *   POST /auth/password-reset  بازیابی رمز با کدِ دلیل password_reset (204؛ نشستی صادر نمی‌شود)
 *
 * چیدمان دوپنلی است: پنل برند (فقط در صفحهٔ بزرگ) هویت محصول و مزیت‌ها را نشان
 * می‌دهد و پنل فرم در همهٔ اندازه‌ها تمام‌عرض و متمرکز می‌ماند.
 */
type Mode = 'password' | 'otp' | 'reset';
type OtpPurpose = 'login' | 'password_reset';

/** فاصله حداقلی دو ارسال کد (OTP_RESEND_SECONDS سرور، پیش‌فرض ۶۰ ثانیه) */
const RESEND_SECONDS = 60;

const MODES: { value: Mode; label: string }[] = [
  { value: 'password', label: 'رمز عبور' },
  { value: 'otp', label: 'کد پیامکی' },
  { value: 'reset', label: 'بازیابی رمز' },
];

const HIGHLIGHTS = [
  { icon: IconTracking, title: 'رهگیری زندهٔ ویزیتورها', text: 'موقعیت لحظه‌ای، ژئوفنس و کنترل بازدید' },
  { icon: IconShield, title: 'تأیید خودکار قوانین', text: 'سقف اعتبار و تخفیف با موتور قوانین' },
  { icon: IconCheck, title: 'کارکرد آفلاین', text: 'ثبت سفارش در مسیر، همگام‌سازی بعدی' },
];

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
  const [showPassword, setShowPassword] = useState(false);

  // شمارش معکوس ارسال مجدد کد — یک interval واحد تا پایان شمارش. پیش‌تر این
  // اثر به [cooldown] وابسته بود و چون interval هر ثانیه cooldown را کم می‌کرد،
  // اثر هر ثانیه از نو اجرا و interval ساخته/پاک می‌شد. با وابستگی به بولینِ
  // «در حال شمارش»، فقط یک interval برای کل شمارش ساخته می‌شود.
  const cooling = cooldown > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooling]);

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

  /** اعتبارسنجی زندهٔ تطابق رمزها — فقط پس از آنکه کاربر چیزی در تکرار نوشت */
  const passwordMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const modeTitle =
    mode === 'password'
      ? 'نام کاربری و رمز عبور خود را وارد کنید'
      : mode === 'otp'
        ? 'کد یک‌بارمصرف پیامکی را وارد کنید'
        : 'کد بازیابی را درخواست و رمز عبور جدید را تعیین کنید';

  /** دکمهٔ درخواست/ارسال مجدد کد — در هر دو تب OTP و بازیابی یکسان است */
  const requestCodeButton = (purpose: OtpPurpose, sent: boolean) => (
    <Button
      type="button"
      variant="secondary"
      onClick={() => void requestCode(purpose)}
      disabled={busy || cooldown > 0}
      className="h-10 shrink-0"
    >
      <IconPhone className="size-4" />
      {cooldown > 0
        ? `ارسال مجدد (${formatNumber(cooldown)})`
        : sent
          ? 'ارسال دوباره'
          : 'درخواست کد'}
    </Button>
  );

  return (
    <main className="flex min-h-screen bg-canvas">
      {/* ---------------------------- پنل برند ---------------------------- */}
      <aside className="relative hidden w-[45%] max-w-2xl shrink-0 overflow-hidden bg-gradient-to-br from-brand-panel to-brand-panel-deep lg:block">
        {/* بافت تزئینی — دایره‌های نرم و شبکهٔ ظریف بدون تصویر بیرونی */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 22%, #ffffff 0, transparent 42%), radial-gradient(circle at 82% 78%, #ffffff 0, transparent 38%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 place-items-center rounded-2xl bg-white/15 text-base font-bold ring-1 ring-white/25 backdrop-blur-sm"
            >
              GD
            </span>
            <div className="leading-tight">
              <div className="text-base font-bold">GreenDMS</div>
              <div className="text-xs text-white/75">سامانه پخش مویرگی</div>
            </div>
          </div>

          <div className="max-w-md space-y-8">
            <div className="space-y-3">
              <h2 className="text-[28px] font-bold leading-snug xl:text-[32px]">
                فروش، توزیع و مالی در یک سامانهٔ یکپارچه
              </h2>
              <p className="text-sm leading-relaxed text-white/80">
                از ثبت سفارش در مسیر تا تسویهٔ تور، انبار، خزانه‌داری و دفتر کل —
                همه با دادهٔ زنده و کنترل دسترسی دقیق.
              </p>
            </div>

            <ul className="space-y-4">
              {HIGHLIGHTS.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <li key={item.title} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20"
                    >
                      <ItemIcon className="size-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{item.title}</span>
                      <span className="block text-xs leading-relaxed text-white/70">{item.text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-[11px] text-white/55">
            © {formatNumber(1404)} تحریر سبز — همهٔ حقوق محفوظ است
          </p>
        </div>
      </aside>

      {/* ---------------------------- پنل فرم ---------------------------- */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <form
          onSubmit={mode === 'password' ? submitPassword : mode === 'otp' ? verifyCode : submitReset}
          className="w-full max-w-md"
        >
          {/* سربرگ — در اندازهٔ بزرگ که پنل برند هست، فشرده‌تر و چپ‌چین */}
          <div className="mb-7 flex flex-col items-center text-center lg:items-start lg:text-start">
            <span
              aria-hidden
              className="mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-active text-sm font-bold text-brand-ink shadow-md lg:hidden"
            >
              GD
            </span>
            <h1 className="text-[22px] font-bold tracking-tight text-ink">
              ورود به سامانه
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-muted">{modeTitle}</p>
          </div>

          {/* انتخاب روش ورود — گروهی از کلیدها (نه tablist، چون tabpanel ندارد) */}
          <div
            role="group"
            aria-label="روش ورود"
            className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-alt p-1"
          >
            {MODES.map((item) => {
              const active = mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchMode(item.value)}
                  className={cn(
                    'h-9 rounded-lg text-[13px] font-medium transition-all duration-150 focus-ring',
                    active ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-4">
            <Field label="نام کاربری" htmlFor="username" required>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="مثلاً admin"
                leading={<IconUser />}
                required
              />
            </Field>

            {mode === 'password' && (
              <Field label="رمز عبور" htmlFor="password" required>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  leading={<IconLock />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
                      className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink focus-ring"
                    >
                      {showPassword ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                    </button>
                  }
                  required
                />
              </Field>
            )}

            {mode === 'otp' && (
              <>
                <Field
                  label="کد پیامکی"
                  htmlFor="code"
                  required
                  hint="کد به شمارهٔ موبایل ثبت‌شدهٔ شما پیامک می‌شود و تا ۲ دقیقه معتبر است."
                >
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder={codeSent ? 'کد ۶ رقمی' : 'ابتدا درخواست کد دهید'}
                      className="flex-1"
                      required
                    />
                    {requestCodeButton('login', codeSent)}
                  </div>
                </Field>
              </>
            )}

            {mode === 'reset' && (
              <>
                <Field
                  label="کد بازیابی پیامکی"
                  htmlFor="reset-code"
                  required
                  hint="پس از تغییر رمز، همهٔ نشست‌های باز شما بسته می‌شود."
                >
                  <div className="flex gap-2">
                    <Input
                      id="reset-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder={resetSent ? 'کد ۶ رقمی' : 'ابتدا درخواست کد دهید'}
                      className="flex-1"
                      required
                    />
                    {requestCodeButton('password_reset', resetSent)}
                  </div>
                </Field>

                <Field label="رمز عبور جدید" htmlFor="new-password" required hint="دست‌کم ۸ نویسه">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    leading={<IconLock />}
                    required
                  />
                </Field>

                <Field
                  label="تکرار رمز عبور جدید"
                  htmlFor="confirm-password"
                  required
                  error={passwordMismatch ? 'رمز عبور و تکرار آن یکسان نیستند' : undefined}
                >
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    leading={<IconLock />}
                    invalid={passwordMismatch}
                    required
                  />
                </Field>
              </>
            )}
          </div>

          {notice && (
            <Alert tone="success" className="mt-5">
              {notice}
            </Alert>
          )}

          {error && (
            <Alert tone="danger" className="mt-5">
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={busy}
            className="mt-6"
          >
            {busy
              ? 'در حال پردازش…'
              : mode === 'password'
                ? 'ورود'
                : mode === 'otp'
                  ? 'ورود با کد'
                  : 'تغییر رمز عبور'}
          </Button>

          <p className="mt-5 rounded-xl border border-line bg-surface-alt px-3 py-2.5 text-center text-[11px] text-ink-subtle">
            حساب آزمایشی:{' '}
            <span className="tnum font-medium text-ink-muted" dir="ltr">
              admin / Admin@1234
            </span>
          </p>
        </form>
      </div>
    </main>
  );
}
