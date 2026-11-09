/**
 * TASK-24Y — حل‌کنندهٔ سیاستِ تأیید (Approval Policy Resolver).
 *
 * مسئله‌ای که این فایل حل می‌کند: پیش از این، «تأیید» فقط یک زنجیره بود که با
 * `entity` پیدا می‌شد. هیچ راهی برای گفتنِ «سفارشِ بالای ۵۰۰ میلیون باید دو نفر را
 * ببیند، ولی زیرِ آن یک نفر کافی است» وجود نداشت — و هیچ تفکیکی بین حاکمیتِ مرکزی
 * و اختیارِ قلمرو نبود.
 *
 * قاعدهٔ حاکم (خواستهٔ صریحِ کار):
 *   • سیاستِ **مرکزی** آستانهٔ حداقلیِ شرکت را تعیین می‌کند و همیشه اجباری است.
 *     تقدمِ آن **ساختاری** است، نه عددی — یک آستانهٔ مبلغِ بزرگ در سیاستِ قلمرو
 *     نمی‌تواند سیاستِ مرکزی را کنار بزند.
 *   • سیاستِ **قلمرو** می‌تواند سخت‌گیرانه‌تر باشد (آستانهٔ کمتر، زنجیرهٔ بیشتر)،
 *     ولی **هرگز** نمی‌تواند سیاستِ مرکزی را حذف یا سست کند.
 *   • اگر هیچ سیاستی یافت نشود ⇒ **fail-closed** (خطای صریح، نه تأییدِ خودکار).
 *
 * این فایل توابعِ خالص است تا بدونِ DB هم آزمون‌پذیر باشد؛ واکشی از DB در
 * `rules-engine.repository.ts` انجام می‌شود.
 */

export type ApprovalPolicyScope = 'central' | 'domain' | 'operation';
export type OnExpiry = 'escalate' | 'auto_reject';

/** ردیفِ سیاست همان‌طور که از DB می‌آید (مبالغ به‌صورتِ رشته). */
export interface ApprovalPolicyRow {
  id: string;
  company_id: string;
  operation: string;
  scope: ApprovalPolicyScope;
  domain_id: string | null;
  min_amount: string | null;
  max_amount: string | null;
  min_risk_score: number | null;
  approval_chain_id: string;
  expires_in_hours: number | null;
  on_expiry: OnExpiry;
  is_active: boolean;
  priority: number;
}

/** زمینه‌ای که سیاست بر اساسِ آن ارزیابی می‌شود. */
export interface ApprovalContext {
  operation: string;
  /** مبلغِ عملیات؛ null یعنی «مبلغ ندارد» */
  amount: number | null;
  /** امتیازِ ریسکِ ۰..۱۰۰؛ null یعنی محاسبه نشده */
  riskScore: number | null;
  /** قلمروِ عملیاتیِ موجودیت؛ null یعنی سراسری */
  domainId: string | null;
}

/** نتیجهٔ حل: زنجیرهٔ الزامی + مهلت + سیاست‌های دخیل. */
export interface ResolvedApprovalPolicy {
  chainId: string;
  expiresInHours: number | null;
  onExpiry: OnExpiry;
  /** سیاستی که زنجیره از آن آمده (سخت‌گیرانه‌ترین) */
  decidingPolicyId: string;
  /** همهٔ سیاست‌های منطبق، به‌ترتیبِ سخت‌گیری */
  matchedPolicyIds: string[];
  /** آیا سیاستِ مرکزی در میانِ منطبق‌ها بود؟ */
  centralApplied: boolean;
}

/** آیا این سیاست با زمینهٔ داده‌شده منطبق است؟ */
export function policyMatches(policy: ApprovalPolicyRow, ctx: ApprovalContext): boolean {
  if (!policy.is_active) return false;
  if (policy.operation !== ctx.operation) return false;

  // قلمرو: سیاستِ قلمرو فقط روی همان قلمرو اثر دارد؛ قلمروِ null یعنی سراسری
  if (policy.scope === 'domain') {
    if (policy.domain_id == null || policy.domain_id !== ctx.domainId) return false;
  }

  // آستانهٔ مبلغ: اگر مبلغ نداریم ولی سیاست آستانه دارد، منطبق نیست
  // (نمی‌توان «بالای ۵۰۰ میلیون» را روی عملیاتِ بی‌مبلغ اعمال کرد).
  if (policy.min_amount != null) {
    if (ctx.amount == null || ctx.amount < Number(policy.min_amount)) return false;
  }
  if (policy.max_amount != null) {
    if (ctx.amount == null || ctx.amount > Number(policy.max_amount)) return false;
  }

  // آستانهٔ ریسک
  if (policy.min_risk_score != null) {
    if (ctx.riskScore == null || ctx.riskScore < policy.min_risk_score) return false;
  }

  return true;
}

/**
 * سختیِ یک سیاست **در همان لایه**. عددِ بزرگ‌تر = سخت‌گیرانه‌تر.
 *
 * مهم: این عدد **هرگز** برای مقایسهٔ سیاستِ مرکزی با سیاستِ قلمرو استفاده
 * نمی‌شود. تقدمِ مرکزی ساختاری است (نگاه کنید به `resolveApprovalPolicy`)، چون
 * هر مقایسهٔ عددی می‌تواند با یک آستانهٔ بزرگِ مبلغ دور زده شود — و آن دقیقاً
 * همان «سیاستِ مرکزیِ قابلِ تضعیف» است که کار منع کرده.
 */
export function policyStrictness(policy: ApprovalPolicyRow): number {
  const minAmount = policy.min_amount == null ? 0 : Number(policy.min_amount);
  const minRisk = policy.min_risk_score ?? 0;
  // مهلتِ کوتاه‌تر سخت‌گیرانه‌تر است؛ بی‌مهلت = ۰ امتیاز
  const expiryScore = policy.expires_in_hours == null ? 0 : 100_000 / policy.expires_in_hours;
  return Math.min(minAmount, 1_000_000_000) * 1000 + minRisk * 10 + expiryScore + (10_000 - policy.priority);
}

/**
 * لایهٔ حاکمیت: مرکزی همیشه لایهٔ بالاتر است.
 * صادر شده چون آزمون‌ها باید **ساختاری‌بودنِ** تقدم را اثبات کنند، نه فقط
 * نتیجه را (یافتهٔ C-1).
 */
export function governanceTier(policy: ApprovalPolicyRow): number {
  return policy.scope === 'central' ? 2 : policy.scope === 'domain' ? 1 : 0;
}

/**
 * حلِ سیاست برای یک زمینه. **خالص** و بدونِ DB.
 *
 * @returns نتیجه، یا `null` اگر هیچ سیاستی منطبق نبود (⇒ فراخوان باید fail-closed کند).
 */
export function resolveApprovalPolicy(
  policies: ApprovalPolicyRow[],
  ctx: ApprovalContext,
): ResolvedApprovalPolicy | null {
  const matched = policies.filter((p) => policyMatches(p, ctx));
  if (matched.length === 0) return null;

  // ۱) لایهٔ حاکمیت ساختاری است: اگر سیاستِ مرکزی منطبق باشد، قلمرو نمی‌تواند
  //    آن را با عددِ بزرگ‌تر (آستانهٔ مبلغ) کنار بزند.
  // ۲) درونِ هر لایه، سخت‌گیرانه‌ترین برنده است.
  const ranked = [...matched].sort((a, b) => {
    const tier = governanceTier(b) - governanceTier(a);
    return tier !== 0 ? tier : policyStrictness(b) - policyStrictness(a);
  });
  const winner = ranked[0];

  return {
    chainId: winner.approval_chain_id,
    expiresInHours: winner.expires_in_hours,
    onExpiry: winner.on_expiry,
    decidingPolicyId: winner.id,
    matchedPolicyIds: ranked.map((p) => p.id),
    centralApplied: ranked.some((p) => p.scope === 'central'),
  };
}

/**
 * اعتبارسنجیِ پیکربندیِ سیاست پیش از ذخیره.
 * هدف: نگذاریم پیکربندیِ ناقص به یک گردشِ تأییدِ بی‌اثر تبدیل شود.
 */
export function validatePolicyInput(input: {
  operation: string;
  scope: ApprovalPolicyScope;
  domainId?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  minRiskScore?: number | null;
  expiresInHours?: number | null;
}): string | null {
  if (!input.operation || input.operation.trim() === '') return 'operation_required';
  if (input.scope === 'domain' && !input.domainId) return 'domain_required_for_domain_scope';
  if (input.scope !== 'domain' && input.domainId) return 'domain_only_for_domain_scope';
  if (
    input.minAmount != null &&
    input.maxAmount != null &&
    input.maxAmount < input.minAmount
  ) {
    return 'amount_range_inverted';
  }
  if (
    input.minRiskScore != null &&
    (input.minRiskScore < 0 || input.minRiskScore > 100)
  ) {
    return 'risk_score_out_of_range';
  }
  if (input.expiresInHours != null && input.expiresInHours <= 0) {
    return 'expires_in_hours_must_be_positive';
  }
  return null;
}

// =====================================================================
// TASK-24Z — ترکیبِ سیاست (Policy Composition) به‌جای «تک‌برنده»
// =====================================================================
//
// یافتهٔ C-1 حسابرسیِ TASK-24Y: `resolveApprovalPolicy()` یک **برندهٔ تنها**
// انتخاب می‌کرد و بقیهٔ سیاست‌های منطبق را کامل دور می‌ریخت. نتیجه:
//   «یک دامنه می‌توانست با گذاشتنِ سیاستی سخت‌گیرانه‌تر/بزرگ‌تر، کنترلِ مرکزی
//    را از گردشِ واقعی حذف کند.»
//
// درمان: سیاست‌ها **ترکیب** می‌شوند. مراحلِ همهٔ سیاست‌های منطبق در یک توالیِ
// قطعی چیده می‌شوند و هیچ مرحله‌ای حذف نمی‌شود. سخت‌گیرانه‌ترین قاعده در هر
// بُعد (مراحل، مهلت، رفتارِ انقضا، الزام) برنده است و تعارض‌ها **صریح** گزارش
// می‌شوند، نه با حدس.

/** یک مرحلهٔ ترکیب‌شده — خروجیِ آماده برای ساختِ approval_step_def. */
export interface ComposedStage {
  step_no: number;
  chain_id: string;
  policy_id: string;
  policy_scope: ApprovalPolicyScope;
  approver_staff_id: string | null;
  approver_role_id: string | null;
  min_amount: number | null;
  max_amount: number | null;
  is_mandatory: boolean;
}

/** تعارضِ صریح بین سیاست‌های منطبق. */
export interface PolicyConflict {
  code: string;
  policy_ids: string[];
  message_fa: string;
}

/** خروجیِ ترکیب. */
export interface ComposedApprovalPolicy {
  decidingPolicyId: string;
  matchedPolicyIds: string[];
  chainIds: string[];
  centralApplied: boolean;
  expiresInHours: number | null;
  onExpiry: OnExpiry;
  stages: ComposedStage[];
  conflicts: PolicyConflict[];
  contributingScopes: ApprovalPolicyScope[];
}

/** سخت‌گیرانه‌ترین مهلت: کوتاه‌ترین. بی‌مهلت یعنی «بی‌نهایت» و سست‌تر است. */
function mergeExpiry(policies: ApprovalPolicyRow[]): number | null {
  let best: number | null = null;
  for (const p of policies) {
    if (p.expires_in_hours == null) continue;
    best = best == null ? p.expires_in_hours : Math.min(best, p.expires_in_hours);
  }
  return best;
}

/** سخت‌گیرانه‌ترین رفتارِ انقضا: auto_reject بر escalate. */
function mergeOnExpiry(policies: ApprovalPolicyRow[]): OnExpiry {
  return policies.some((p) => p.on_expiry === 'auto_reject') ? 'auto_reject' : 'escalate';
}

/**
 * چیدنِ مراحلِ همهٔ سیاست‌ها در یک توالی.
 *
 * — ترتیب: رتبهٔ حاکمیت نزولی (مرکزی اول)، سپس سخت‌گیری نزولی، سپس `id`
 *   (شکنندهٔ قطعیِ نهایی تا خروجی مستقل از ترتیبِ ردیف‌های DB باشد).
 * — حذفِ تکرار: فقط وقتی *همهٔ* مشخصاتِ مرحله یکسان باشد (همان تأییدکننده،
 *   همان باند، همان الزام‌بودن). الزامی هیچ‌وقت به نفعِ اختیاری حذف نمی‌شود.
 */
export function composeStages(
  contributions: Array<{
    policy: ApprovalPolicyRow;
    stages: Array<Omit<ComposedStage, 'step_no' | 'policy_id' | 'policy_scope' | 'chain_id'>>;
  }>,
): ComposedStage[] {
  const ordered = [...contributions].sort((a, b) => {
    const tier = governanceTier(b.policy) - governanceTier(a.policy);
    if (tier !== 0) return tier;
    const strict = policyStrictness(b.policy) - policyStrictness(a.policy);
    return strict !== 0 ? strict : a.policy.id.localeCompare(b.policy.id);
  });

  const out: ComposedStage[] = [];
  const seen = new Set<string>();

  for (const { policy, stages } of ordered) {
    for (const [ordinal, s] of stages.entries()) {
      const key = [
        ordinal, // preserve repeated required steps within each chain
        s.approver_staff_id ?? '',
        s.approver_role_id ?? '',
        s.min_amount ?? '',
        s.max_amount ?? '',
        s.is_mandatory ? 'M' : 'O',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        step_no: out.length + 1,
        chain_id: policy.approval_chain_id,
        policy_id: policy.id,
        policy_scope: policy.scope,
        approver_staff_id: s.approver_staff_id ?? null,
        approver_role_id: s.approver_role_id ?? null,
        min_amount: s.min_amount ?? null,
        max_amount: s.max_amount ?? null,
        is_mandatory: s.is_mandatory,
      });
    }
  }

  return out;
}

/**
 * تشخیصِ تعارضِ صریح.
 *
 * قاعده: اگر کفِ خواسته‌شده از سقفِ خواسته‌شده بیشتر شود، بازهٔ مبلغ **خالی**
 * است و هیچ مبلغی نمی‌تواند همهٔ سیاست‌ها را راضی کند. در چنین حالتی انتخابِ
 * ساکتِ یکی از دو سیاست = نادیده‌گرفتنِ کنترلِ امنیتیِ یک نفر. پس خطا می‌دهیم.
 */
export function detectConflicts(matched: ApprovalPolicyRow[]): PolicyConflict[] {
  const conflicts: PolicyConflict[] = [];

  const minFloor = matched.reduce<number | null>(
    (m, p) => (p.min_amount == null ? m : m == null ? Number(p.min_amount) : Math.max(m, Number(p.min_amount))),
    null,
  );
  const maxCeil = matched.reduce<number | null>(
    (m, p) => (p.max_amount == null ? m : m == null ? Number(p.max_amount) : Math.min(m, Number(p.max_amount))),
    null,
  );

  if (minFloor != null && maxCeil != null && minFloor > maxCeil) {
    conflicts.push({
      code: 'amount_range_unsatisfiable',
      policy_ids: matched.filter((p) => p.min_amount != null || p.max_amount != null).map((p) => p.id),
      message_fa:
        'بازهٔ مبلغِ سیاست‌های تأیید ناسازگار است: کفِ خواسته‌شده از سقفِ خواسته‌شده بیشتر است.',
    });
  }

  return conflicts;
}

/**
 * ترکیبِ کاملِ سیاست برای یک زمینه — **خالص** و قطعی.
 *
 * @param chainStages نقشهٔ `approval_chain_id` ⇒ مراحلِ تعریف‌شدهٔ آن زنجیره.
 *        اگر داده نشود، `stages` خالی می‌ماند (فراخوان باید fail-closed کند).
 * @returns `null` اگر هیچ سیاستی منطبق نبود (⇒ عملیات بدونِ تأیید اجرا نمی‌شود).
 */
export function composeApprovalPolicy(
  policies: ApprovalPolicyRow[],
  ctx: ApprovalContext,
  chainStages?: Map<
    string,
    Array<{
      approver_staff_id: string | null;
      approver_role_id: string | null;
      min_amount: number | null;
      max_amount: number | null;
      is_mandatory: boolean;
    }>
  >,
): ComposedApprovalPolicy | null {
  const matched = policies.filter((p) => policyMatches(p, ctx));
  if (matched.length === 0) return null;

  const ranked = [...matched].sort((a, b) => {
    const tier = governanceTier(b) - governanceTier(a);
    if (tier !== 0) return tier;
    const strict = policyStrictness(b) - policyStrictness(a);
    return strict !== 0 ? strict : a.id.localeCompare(b.id);
  });
  const winner = ranked[0];

  const contributions = chainStages
    ? ranked
        .filter((p) => chainStages.has(p.approval_chain_id))
        .map((policy) => ({ policy, stages: chainStages.get(policy.approval_chain_id)! }))
    : [];

  return {
    decidingPolicyId: winner.id,
    matchedPolicyIds: ranked.map((p) => p.id),
    chainIds: [...new Set(ranked.map((p) => p.approval_chain_id))],
    centralApplied: ranked.some((p) => p.scope === 'central'),
    expiresInHours: mergeExpiry(ranked),
    onExpiry: mergeOnExpiry(ranked),
    stages: composeStages(contributions),
    conflicts: detectConflicts(ranked),
    contributingScopes: [...new Set(ranked.map((p) => p.scope))],
  };
}
