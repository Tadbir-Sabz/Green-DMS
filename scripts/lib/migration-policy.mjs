/**
 * سیاستِ مهاجرت (S8-07) — توابعِ خالص (بدون اتصال به پایگاه‌داده) که هم migrate.mjs و هم آزمون‌ها استفاده می‌کنند.
 *
 *  - rollbackRefusal:   بازگشتِ مهاجرت‌هایی که بازگشتِ ایمنِ ابزاری ندارند (R1) — رد صریح با دستورِ بازیابی.
 *  - unsafeDefinerBodies: بدنه‌های SECURITY DEFINER که در یک down بازگردانده می‌شوند و search_path پین‌شده ندارند.
 *  - requiresOwnerWindow: مهاجرتی که به dms_owner ارجاع اجرایی دارد (R2).
 *  - windowDecision:    تصمیمِ قفلِ پنجرهٔ خارجی (R2)؛ «قفلِ خودِ فرایند» هرگز خارجی حساب نمی‌شود.
 *  - callerRefusal:     مسیرِ API (auto-migrate) هرگز مهاجرتِ owner-دار را اعمال نمی‌کند (R2).
 *  - checksumRecord / verifyChecksum: سیاستِ checksum برای up و down (R9) با انتقالِ سازگار به ردیف‌های قدیمی.
 */

/** مهاجرت‌هایی که بازگشتِ ابزاری‌شان رد می‌شود (fail-closed). کلید = شماره‌ی مهاجرت. */
export const ROLLBACK_REFUSED = Object.freeze({
  '0072': Object.freeze({
    reason:
      'down مهاجرت 0072 بدنهٔ 0070 (fn_maintain_inventory_partitions) را با search_path بدون pg_temp بازمی‌گرداند؛ ' +
      'این همان سطح D1 است (شیءِ موقتِ سایه‌زن). هیچ بازگشتِ ایمنِ ابزاری ثابت نشده است.',
    recovery:
      'بازیابی فقط از پشتیبانِ پیش از up: ' +
      'ابتدا پنجره را با «node scripts/db-window.mjs grant» باز و با «revoke» ببندید، سپس بازیابیِ pg_restore ' +
      'به همان پایگاه/پایگاهِ یکبارمصرف طبق docs/deploy/PRODUCTION_DEPLOYMENT.md بخش ۳-ج؛ ' +
      'پس از بازیابی «node scripts/db-window.mjs verify» را اجرا کنید.',
  }),
});

/** پیامِ رد برای یک بازگشت (یا null اگر مجاز است). */
export function rollbackRefusal(version) {
  const r = ROLLBACK_REFUSED[version];
  if (!r) return null;
  return `بازگشتِ مهاجرت ${version} رد شد. ${r.reason} بازیابی: ${r.recovery}`;
}

/** حذفِ توضیح‌های SQL (خطی و بلوکی) تا فقط ارجاعِ اجرایی بررسی شود. */
export function stripSqlComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * توابعِ SECURITY DEFINER که در یک فایل تعریف می‌شوند و search_path آن‌ها ناامن است.
 * قاعده: هر تابعِ DEFINER باید search_path صریح داشته باشد که pg_temp در آن موجود و «آخرین» عضو باشد.
 * (اگر pg_temp در فهرست نباشد، PostgreSQL آن را «اول» و ضمنی جست‌وجو می‌کند ⇒ جدولِ موقتِ سایه‌زن.)
 * خروجی: فهرست {name, reason} برای توابعِ ناامن؛ خالی یعنی ایمن.
 */
export function unsafeDefinerBodies(sql) {
  const code = stripSqlComments(sql);
  // S8-07: بدونِ slice(1)؛ split با lookahead در اندیس ۰ عنصرِ خالیِ ابتدایی نمی‌سازد و تابعِ اولِ فایل حذف می‌شد.
  const chunks = code.split(/(?=\bcreate\s+(?:or\s+replace\s+)?function\b)/i);
  const bad = [];
  for (const chunk of chunks) {
    const bodyAt = chunk.search(/\bas\s*\$/i);
    const header = bodyAt >= 0 ? chunk.slice(0, bodyAt) : chunk;
    if (!/\bsecurity\s+definer\b/i.test(header)) continue;
    const name = /\bfunction\s+(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)/i.exec(header)?.[1] ?? '?';
    const sp = /\bset\s+search_path\s*=\s*([^\n;]+)/i.exec(header);
    if (!sp) {
      bad.push({ name, reason: 'search_path صریح ندارد' });
      continue;
    }
    // S8-07: فهرستِ search_path در همان سطر به کلیدواژهٔ as/language ختم می‌شود (تعریف تک‌خطی).
    const listText = sp[1].split(/\s+(?:as|language|returns|volatile|stable|immutable|strict|parallel|cost)\b/i)[0];
    const list = listText
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter(Boolean);
    const idx = list.indexOf('pg_temp');
    if (idx === -1) bad.push({ name, reason: `search_path بدون pg_temp است (${list.join(', ')})` });
    else if (idx !== list.length - 1) bad.push({ name, reason: 'pg_temp آخرین عضو search_path نیست' });
  }
  return bad;
}

/** مهاجرتی که به dms_owner ارجاع اجرایی دارد (توضیح‌های خطی نادیده گرفته می‌شوند). */
export function requiresOwnerWindow(sql) {
  return /\bdms_owner\b/.test(stripSqlComments(sql));
}

/**
 * تصمیمِ قفلِ پنجرهٔ مهاجرت (R2) از روی pg_locks، بدون گرفتنِ قفل.
 *   ownLocks:        تعداد قفل‌های dms-db-window که خودِ این نشست نگه داشته است
 *   externalHolders: تعداد قفل‌های granted که نشستی دیگر نگه داشته است
 * null یعنی مجاز؛ وگرنه پیام رد.
 */
export function windowDecision({ ownLocks, externalHolders, requiresOwner }) {
  if (!requiresOwner) return null;
  if (!Number.isInteger(ownLocks) || !Number.isInteger(externalHolders)) {
    return 'بررسیِ قفلِ پنجره ناتمام ماند (خروجیِ نامعتبر)؛ مهاجرتِ owner-دار رد شد (fail-closed).';
  }
  if (ownLocks > 0) {
    return 'این نشست خودش قفلِ پنجره را نگه داشته است؛ قفلِ خودی به‌حساب پنجرهٔ خارجی گرفته نمی‌شود.';
  }
  if (externalHolders < 1) {
    return 'مهاجرتِ owner-دار فقط در پنجرهٔ مهاجرت مجاز است: قفلِ «dms-db-window» توسط نشستِ دیگری نگه داشته نشده است. اجرا: node scripts/db-window.mjs up';
  }
  return null;
}

/** مسیرِ API (auto-migrate) هرگز مهاجرتِ owner-دار را اعمال نمی‌کند، حتی اگر پنجره باز باشد. */
export function callerRefusal({ caller, requiresOwner }) {
  if (caller === 'api-auto' && requiresOwner) {
    return 'اعمالِ خودکارِ API برای مهاجرتِ owner-دار مجاز نیست؛ فقط پنجرهٔ مهاجرت (scripts/db-window.mjs up).';
  }
  return null;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** ساختِ ردیفِ checksum برای مهاجرتِ جدید: «v2:<sha256(up)>:<sha256(down)>». */
export function checksumRecord({ upHash, downHash }) {
  if (!HEX64.test(upHash ?? '') || !HEX64.test(downHash ?? '')) {
    throw new Error('checksumRecord: هشِ up و down باید sha256 هگزِ ۶۴ نویسه باشند');
  }
  return `v2:${upHash}:${downHash}`;
}

/**
 * تفسیرِ ردیفِ ثبت‌شده:
 *   - 64 نویسهٔ هگز ⇒ legacy (فقط up ثبت شده؛ down هرگز ثبت نشده و بازتفسیر نمی‌شود)
 *   - v2:<up>:<down> ⇒ کامل
 *   - هر چیزِ دیگر ⇒ malformed
 */
export function parseChecksum(raw) {
  const s = String(raw ?? '');
  if (HEX64.test(s)) return { kind: 'legacy', up: s, down: null };
  const m = /^v2:([0-9a-f]{64}):([0-9a-f]{64})$/.exec(s);
  if (m) return { kind: 'v2', up: m[1], down: m[2] };
  return { kind: 'malformed', up: null, down: null };
}

/**
 * مقایسهٔ ردیف با فایل‌های فعلی. state:
 *   ok              — v2 و up/down هر دو مطابق
 *   legacy-up-ok    — legacy و up مطابق (down برای این ردیف ثبت نشده؛ گزارش می‌شود، رد نمی‌شود)
 *   up-drift        — up تغییر کرده
 *   down-drift      — (v2) down تغییر کرده
 *   missing-down    — (v2) فایل down موجود نیست
 *   malformed       — ردیفِ checksum نامعتبر
 * ok=true فقط برای ok و legacy-up-ok.
 */
export function verifyChecksum(raw, { upHash, downHash = null }) {
  const p = parseChecksum(raw);
  if (p.kind === 'malformed') return { ok: false, state: 'malformed', problem: 'checksum ثبت‌شده نامعتبر است' };
  if (p.kind === 'legacy') {
    return upHash === p.up
      ? { ok: true, state: 'legacy-up-ok', problem: null }
      : { ok: false, state: 'up-drift', problem: 'فایل up با checksum ثبت‌شده ناهمخوان است' };
  }
  if (upHash !== p.up) return { ok: false, state: 'up-drift', problem: 'فایل up با checksum ثبت‌شده ناهمخوان است' };
  if (!downHash) return { ok: false, state: 'missing-down', problem: 'فایل down برای این مهاجرت موجود نیست' };
  if (downHash !== p.down) return { ok: false, state: 'down-drift', problem: 'فایل down با checksum ثبت‌شده ناهمخوان است' };
  return { ok: true, state: 'ok', problem: null };
}
