import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  SlidingWindowCounter,
  clientIpOf,
  isValidInviteCode,
  loadOnboardingPolicy,
  normalizeIpForDb,
  passwordClassCount,
  passwordIssues,
  resetOnboardingGuardForTest,
} from '../src/modules/onboarding/abuse-control';
import { OnboardingService } from '../src/modules/onboarding/onboarding.service';
import type { RegisterTenantDto } from '../src/modules/onboarding/onboarding.dto';

/**
 * محافظت در برابرِ سوءاستفادهٔ خودخدمت‌دهیِ استقرار (P0) — بدونِ DB.
 *
 * POST /onboarding/register عمومی و بدونِ نشست است. این تست‌ها اثبات می‌کنند که
 * (۱) نرخ‌گذاریِ لغزان واقعاً پس از سقف جلوی درخواست را می‌گیرد و پنجره سر می‌رسد،
 * (۲) سیاستِ رمز و کدِ دعوت fail-closed هستند،
 * (۳) ممیزیِ هر تلاش نوشته می‌شود، و
 * (۴) شکستِ ممیزی جلویِ جریانِ اصلی را نمی‌گیرد.
 * در سطحِ HTTP (۴۲۹ با Retry-After) در تستِ یکپارچهٔ DB-دار سنجیده می‌شود.
 */

const validDto = (over: Partial<RegisterTenantDto> = {}): RegisterTenantDto =>
  ({
    company_code: 'acme',
    company_name: 'اکمه',
    admin_email: 'admin@acme.test',
    admin_password: 'Admin@1234',
    ...over,
  }) as RegisterTenantDto;

function fakeRepo(overrides: Record<string, unknown> = {}) {
  return {
    provisionCompany: vi.fn().mockResolvedValue({
      company_id: '11111111-1111-4111-8111-111111111111',
      branch_id: '22222222-2222-4222-8222-222222222222',
      person_id: '33333333-3333-4333-8333-333333333333',
      app_user_id: '44444444-4444-4444-8444-444444444444',
    }),
    companyCodeExists: vi.fn().mockResolvedValue(false),
    usernameExists: vi.fn().mockResolvedValue(false),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  // سیاست را برای هر تست از نو بساز تا آلودگیِ env بین تست‌ها نتیجه را عوض نکند
  resetOnboardingGuardForTest({} as NodeJS.ProcessEnv);
});

describe('SlidingWindowCounter — نرخ‌گذاریِ لغزان', () => {
  it('تا سقف اجازه می‌دهد و پس از آن رد می‌کند', () => {
    const limiter = new SlidingWindowCounter({ limit: 3, windowMs: 1000 });
    expect(limiter.hit('ip1').allowed).toBe(true);
    expect(limiter.hit('ip1').allowed).toBe(true);
    const third = limiter.hit('ip1');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const blocked = limiter.hit('ip1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retry_after_sec).toBeGreaterThanOrEqual(1);
  });

  it('کلیدهایِ مختلف سهمیهٔ مستقل دارند (IP دیگر قربانی نمی‌شود)', () => {
    const limiter = new SlidingWindowCounter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('پس از گذرِ پنجره، سهمیه برمی‌گردد (لغزان، نه ثابت)', () => {
    let now = 10_000;
    const limiter = new SlidingWindowCounter({ limit: 2, windowMs: 1000, now: () => now });
    expect(limiter.hit('x').allowed).toBe(true);
    now += 600;
    expect(limiter.hit('x').allowed).toBe(true);
    now += 100;
    expect(limiter.hit('x').allowed).toBe(false); // هنوز در پنجره
    now += 400; // نخستین ضربه (t=10000) از پنجره بیرون رفت
    expect(limiter.hit('x').allowed).toBe(true);
  });

  it('retry_after_sec دقیقاً زمانِ باقی‌ماندهٔ قدیمی‌ترین ضربه است', () => {
    let now = 0;
    const limiter = new SlidingWindowCounter({ limit: 1, windowMs: 10_000, now: () => now });
    limiter.hit('k');
    now = 3000;
    expect(limiter.hit('k').retry_after_sec).toBe(7);
  });

  it('peek سهمیه مصرف نمی‌کند؛ size و clear کار می‌کنند', () => {
    const limiter = new SlidingWindowCounter({ limit: 2, windowMs: 1000 });
    limiter.hit('k');
    expect(limiter.peek('k')).toEqual({ count: 1, remaining: 1 });
    expect(limiter.peek('k')).toEqual({ count: 1, remaining: 1 });
    expect(limiter.size).toBe(1);
    limiter.clear();
    expect(limiter.size).toBe(0);
    expect(limiter.hit('k').allowed).toBe(true);
  });

  it('سقفِ کمتر از ۱ به ۱ گرد می‌شود (هرگز بن‌بستِ کامل)', () => {
    const limiter = new SlidingWindowCounter({ limit: 0, windowMs: 1000 });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(false);
  });
});

describe('loadOnboardingPolicy — پیکربندی از env', () => {
  it('پیش‌فرض‌ها خودخدمت‌دهی را باز و محافظه‌کارانه نگه می‌دارند', () => {
    const p = loadOnboardingPolicy({} as NodeJS.ProcessEnv);
    expect(p.mode).toBe('open');
    expect(p.ipHourLimit).toBe(20);
    expect(p.globalDayLimit).toBe(500);
    expect(p.minPasswordLength).toBe(8);
    expect(p.minPasswordClasses).toBe(3);
    expect(p.inviteCodes).toEqual([]);
  });

  it('overrideهایِ env خوانده می‌شوند و مقدارِ نامعتبر به پیش‌فرض برمی‌گردد', () => {
    const p = loadOnboardingPolicy({
      ONBOARDING_MODE: 'invite',
      ONBOARDING_INVITE_CODES: 'a1 , b2 ,, c3',
      ONBOARDING_IP_HOUR_LIMIT: '2',
      ONBOARDING_GLOBAL_DAY_LIMIT: '10',
      ONBOARDING_MIN_PASSWORD_LENGTH: '12',
    } as unknown as NodeJS.ProcessEnv);
    expect(p.mode).toBe('invite');
    expect(p.inviteCodes).toEqual(['a1', 'b2', 'c3']);
    expect(p.ipHourLimit).toBe(2);
    expect(p.globalDayLimit).toBe(10);
    expect(p.minPasswordLength).toBe(12);

    const bad = loadOnboardingPolicy({
      ONBOARDING_MODE: 'weird',
      ONBOARDING_IP_HOUR_LIMIT: 'not-a-number',
      ONBOARDING_GLOBAL_DAY_LIMIT: '-5',
      ONBOARDING_MIN_PASSWORD_LENGTH: '3', // زیرِ حداقلِ امن → نادیده
    } as unknown as NodeJS.ProcessEnv);
    expect(bad.mode).toBe('open');
    expect(bad.ipHourLimit).toBe(20);
    expect(bad.globalDayLimit).toBe(500);
    expect(bad.minPasswordLength).toBe(8);
  });
});

describe('سیاستِ رمز — اعتبارسنجیِ مقاوم', () => {
  const policy = loadOnboardingPolicy({} as NodeJS.ProcessEnv);

  it('دسته‌هایِ نویسه را درست می‌شمارد', () => {
    expect(passwordClassCount('abcdefgh')).toBe(1);
    expect(passwordClassCount('abcd1234')).toBe(2);
    expect(passwordClassCount('Admin@1234')).toBe(4);
  });

  it('رمزِ معتبر را می‌پذیرد و مواردِ ضعیف را با کدِ پایدار رد می‌کند', () => {
    expect(passwordIssues('Admin@1234', policy)).toEqual([]);
    expect(passwordIssues('Ab@1', policy)).toContain('password_too_short');
    expect(passwordIssues('abcdefghij', policy)).toContain('password_too_simple');
    expect(passwordIssues('password1', policy)).toContain('password_too_common');
    expect(passwordIssues('Password1', policy)).toContain('password_too_common');
    expect(passwordIssues('aaaaaaa1A', policy)).toContain('password_repetitive');
  });

  it('رمزِ خالی/تعریف‌نشدده رد می‌شود (بدونِ پرتاب)', () => {
    expect(passwordIssues('', policy).length).toBeGreaterThan(0);
    expect(passwordIssues(undefined as unknown as string, policy)).toContain('password_too_short');
  });
});

describe('isValidInviteCode — حالتِ دعوت', () => {
  it('در حالتِ open کد دعوت لازم نیست (رفتارِ پیشین حفظ می‌شود)', () => {
    const open = loadOnboardingPolicy({} as NodeJS.ProcessEnv);
    expect(isValidInviteCode(undefined, open)).toBe(true);
    expect(isValidInviteCode('anything', open)).toBe(true);
  });

  it('در حالتِ invite فقط کدِ پیکربندی‌شده می‌گذرد', () => {
    const invite = loadOnboardingPolicy({
      ONBOARDING_MODE: 'invite',
      ONBOARDING_INVITE_CODES: 'SECRET-1,SECRET-2',
    } as unknown as NodeJS.ProcessEnv);
    expect(isValidInviteCode('SECRET-1', invite)).toBe(true);
    expect(isValidInviteCode(' SECRET-2 ', invite)).toBe(true);
    expect(isValidInviteCode('secret-1', invite)).toBe(false);
    expect(isValidInviteCode('SECRET-3', invite)).toBe(false);
    expect(isValidInviteCode(undefined, invite)).toBe(false);
    expect(isValidInviteCode('', invite)).toBe(false);
  });

  it('حالتِ invite بدونِ کدِ پیکربندی‌شده «بسته» است (fail-closed)', () => {
    const invite = loadOnboardingPolicy({ ONBOARDING_MODE: 'invite' } as unknown as NodeJS.ProcessEnv);
    expect(isValidInviteCode('anything', invite)).toBe(false);
  });
});

describe('clientIpOf و normalizeIpForDb', () => {
  it('نخستین هاپِ X-Forwarded-For، سپس req.ip، سپس سوکت', () => {
    expect(clientIpOf({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4');
    expect(clientIpOf({ headers: { 'x-forwarded-for': ['5.6.7.8', '9.9.9.9'] } })).toBe('5.6.7.8');
    expect(clientIpOf({ ip: '3.3.3.3', headers: {} })).toBe('3.3.3.3');
    expect(clientIpOf({ socket: { remoteAddress: '::1' } })).toBe('::1');
    expect(clientIpOf({})).toBe('unknown');
  });

  it('مقدارِ غیرقابلِ تفسیر برایِ ستونِ inet → تهی (نه شکستِ درج)', () => {
    expect(normalizeIpForDb('192.168.1.1')).toBe('192.168.1.1');
    expect(normalizeIpForDb('::ffff:10.0.0.1')).toBe('::ffff:10.0.0.1');
    expect(normalizeIpForDb('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIpForDb('unknown')).toBeNull();
    expect(normalizeIpForDb('999.1.1.1')).toBeNull();
    expect(normalizeIpForDb('not an ip')).toBeNull();
    expect(normalizeIpForDb(null)).toBeNull();
    expect(normalizeIpForDb('')).toBeNull();
    expect(normalizeIpForDb('1.2.3.4'.repeat(20))).toBeNull();
  });
});

describe('OnboardingService.register — اجرای سیاست و ممیزی', () => {
  it('رمزِ ضعیف → 400 weak_password، بدونِ هیچ کارِ پرهزینهٔ DB یا هش', async () => {
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    let err: unknown;
    try {
      await svc.register(validDto({ admin_password: 'abcdefgh' }), { clientIp: '1.2.3.4' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as { getResponse: () => { code: string } }).getResponse().code).toBe('weak_password');
    // scrypt و DB هرگز صدا زده نشدند → حملهٔ پرهزینه کردنِ سرور بی‌اثر است
    expect(repo.provisionCompany).not.toHaveBeenCalled();
    expect(repo.companyCodeExists).not.toHaveBeenCalled();
    expect(repo.recordAttempt).toHaveBeenCalledTimes(1);
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      outcome: 'rejected_policy',
      reasonCode: 'password_too_simple',
      clientIp: '1.2.3.4',
    });
    // رمز یا هشِ رمز هرگز در ممیزی ثبت نمی‌شود
    const auditArg = JSON.stringify(repo.recordAttempt.mock.calls[0][0]);
    expect(auditArg).not.toContain('abcdefgh');
  });

  it('حالتِ invite با کدِ نامعتبر → 403 و ممیزی', async () => {
    resetOnboardingGuardForTest({
      ONBOARDING_MODE: 'invite',
      ONBOARDING_INVITE_CODES: 'GOOD-CODE',
    } as unknown as NodeJS.ProcessEnv);
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    await expect(
      svc.register(validDto({ invite_code: 'BAD-CODE' }), { clientIp: '9.9.9.9' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.provisionCompany).not.toHaveBeenCalled();
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      outcome: 'rejected_policy',
      reasonCode: 'invite_code_invalid',
    });
  });

  it('کدِ دعوتِ درست در حالتِ invite → اجاره ساخته می‌شود و ممیزیِ created ثبت می‌شود', async () => {
    resetOnboardingGuardForTest({
      ONBOARDING_MODE: 'invite',
      ONBOARDING_INVITE_CODES: 'GOOD-CODE',
    } as unknown as NodeJS.ProcessEnv);
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    const out = await svc.register(validDto({ invite_code: 'GOOD-CODE' }), { clientIp: '8.8.8.8' });
    expect(out.company_id).toBeTruthy();
    expect(repo.provisionCompany).toHaveBeenCalledTimes(1);
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({ outcome: 'created' });
    expect(repo.recordAttempt.mock.calls[0][0].companyId).toBe(out.company_id);
  });

  it('تعارضِ کدِ شرکت → 409 با ممیزیِ rejected_conflict', async () => {
    const repo = fakeRepo({ companyCodeExists: vi.fn().mockResolvedValue(true) });
    const svc = new OnboardingService(repo as never);
    await expect(svc.register(validDto(), {})).rejects.toMatchObject({
      response: { code: 'company_code_taken' },
    });
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      outcome: 'rejected_conflict',
      reasonCode: 'company_code_taken',
    });
  });

  it('شکستِ ممیزی هرگز جلویِ ثبت را نمی‌گیرد (best-effort)', async () => {
    const repo = fakeRepo({ recordAttempt: vi.fn().mockRejectedValue(new Error('42501 permission denied')) });
    const svc = new OnboardingService(repo as never);
    const out = await svc.register(validDto(), { clientIp: '7.7.7.7' });
    expect(out.company_id).toBeTruthy();
    expect(repo.provisionCompany).toHaveBeenCalledTimes(1);
  });

  it('IP غیرقابلِ تفسیر در ممیزی تهی می‌شود ولی جریانِ ثبت سالم است', async () => {
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    await svc.register(validDto(), { clientIp: 'unknown', userAgent: 'vitest' });
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      clientIp: null,
      userAgent: 'vitest',
      outcome: 'created',
    });
  });
});

describe('OnboardingService.recordRejection — ممیزیِ ردِ نرخ از کنترلر', () => {
  it('تلاشِ رد‌شدهٔ نرخ را بدونِ ساختِ اجاره ثبت می‌کند', async () => {
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    await svc.recordRejection('rejected_rate_limit', 'ip_hour_limit', validDto(), {
      clientIp: '1.2.3.4',
      userAgent: 'curl/8',
    });
    expect(repo.provisionCompany).not.toHaveBeenCalled();
    expect(repo.recordAttempt).toHaveBeenCalledTimes(1);
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      outcome: 'rejected_rate_limit',
      reasonCode: 'ip_hour_limit',
      clientIp: '1.2.3.4',
      companyId: null,
    });
  });

  it('بدونِ dto هم کار می‌کند (پیش از اعتبارسنجیِ بدنه)', async () => {
    const repo = fakeRepo();
    const svc = new OnboardingService(repo as never);
    await svc.recordRejection('rejected_rate_limit', 'global_day_limit');
    expect(repo.recordAttempt.mock.calls[0][0]).toMatchObject({
      outcome: 'rejected_rate_limit',
      companyCode: null,
      adminEmail: null,
    });
  });
});
