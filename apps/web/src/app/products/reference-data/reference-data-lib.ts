/**
 * ابزار خالص صفحهٔ «مدیریت دادههای مرجع» (TASK-PM-02-C2).
 *
 * هیچ وابستهای به React/API ندارد تا در تستهای واحد قابل اثبات باشد. مسئول
 * برچسبهای فارسی، اعداد فارسی، مسیرسازی سلسلهمراتب RTL و جلوگیری از انتخاب
 * والد حلقهدار در همان لایهای است که کاربر میبیند (سرور هم مستقلاً بررسی میکند).
 */
import type { components } from '@dms/api-client';
import type { Category, Unit } from '../products-lib';

export type Brand = components['schemas']['Brand'];
export type BrandDetail = components['schemas']['BrandDetail'];
export type UnitDetail = components['schemas']['UnitDetail'];
export type CategoryDetail = components['schemas']['CategoryDetail'];
export type ReferenceProduct = components['schemas']['ReferenceProduct'];
export type ReferenceAuditEvent = components['schemas']['ReferenceAuditEvent'];
export type ReferenceMutationResult = components['schemas']['ReferenceMutationResult'];
export type RefKind = 'brand' | 'unit' | 'category';
export type TabKey = 'brands' | 'units' | 'categories' | 'history';
export type ActiveFilter = 'all' | 'active' | 'inactive';

export const PAGE_SIZE = 20;

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'brands', label: 'برندها' },
  { key: 'units', label: 'واحدهای اندازهگیری' },
  { key: 'categories', label: 'دستهبندیها' },
  { key: 'history', label: 'تاریخچهٔ تغییرات' },
];

export const ENTITY_LABEL_FA: Record<string, string> = {
  brand: 'برند',
  uom: 'واحد اندازهگیری',
  product_category: 'دستهبندی کالا',
};

export const ACTION_LABEL_FA: Record<string, string> = {
  create: 'ایجاد',
  update: 'ویرایش',
  delete: 'حذف',
  domain_boundary_rejected: 'رد مرز دامنهای',
};

export const ACTIVE_FILTER_LABEL: Record<ActiveFilter, string> = {
  all: 'همه',
  active: 'فعال',
  inactive: 'غیرفعال',
};

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** عدد را برای نمایش فارسی (بدون وابستگی به locale مرورگر) برمیگرداند. */
export function faNumber(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
}

export function activeFilterValue(value: ActiveFilter): boolean | undefined {
  if (value === 'active') return true;
  if (value === 'inactive') return false;
  return undefined;
}

export function activeLabel(isActive?: boolean): string {
  return isActive === false ? 'غیرفعال' : 'فعال';
}

export function activeToneCls(isActive?: boolean): string {
  return `rounded-full px-2 py-0.5 text-xs ${
    isActive === false ? 'bg-surface-alt text-ink-muted' : 'bg-brand-soft text-success-ink'
  }`;
}

/** «نمایش ۱–۲۰ از ۴۰» — برای صفحهبندی سرورمحور. */
export function pageRangeLabel(offset: number, total: number, limit = PAGE_SIZE): string {
  if (total <= 0) return 'موردی یافت نشد.';
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return `نمایش ${faNumber(from)}–${faNumber(to)} از ${faNumber(total)}`;
}

/** تاریخ ممیزی را بدون وابستگی به locale مرورگر، فارسی نمایش میدهد. */
export function formatAuditDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** برچسب گزینهٔ واحد — نماد/کد/عنوان و دقت اعشار D3. */
export function unitOptionLabel(u: Unit): string {
  const symbol = u.symbol ? ` (${u.symbol})` : '';
  return `${u.code} — ${u.title}${symbol} · ${faNumber(u.decimal_places ?? 0)} رقم اعشار`;
}

/** برچسب گزینهٔ برند — کد قدیمی ممکن است NULL باشد. */
export function brandOptionLabel(b: Brand): string {
  const code = b.code ? `${b.code} — ` : '';
  const latin = b.name_latin ? ` (${b.name_latin})` : '';
  return `${code}${b.name}${latin}`;
}

/** عمق هر دسته از روی زنجیرهٔ parent_id (با محافظ حلقه). */
export function categoryDepthMap(rows: readonly Category[]): Map<string, number> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depths = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // حلقهٔ ناخواسته: عمق امن
    seen.add(id);
    const row = byId.get(id);
    const depth = row?.parent_id ? compute(row.parent_id, seen) + 1 : 0;
    depths.set(id, depth);
    return depth;
  };
  for (const row of rows) compute(row.id, new Set<string>());
  return depths;
}

/** خود رکورد + همهٔ نوادگانش — برای جلوگیری از والد حلقهدار در UI. */
export function descendantIds(rows: readonly Category[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = children.get(row.parent_id) ?? [];
    list.push(row.id);
    children.set(row.parent_id, list);
  }
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return out;
}

/** زنجیرهٔ ریشه ← والد مستقیم (همتراز با `ancestors` سرویس). */
export function categoryPath(rows: readonly Category[], id: string): Category[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: Category[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    path.push(parent);
    current = parent;
  }
  return path.reverse();
}

/** گزینههای والد: فقط دستههای فعال، بدون خود رکورد و نوادگانش. */
export function parentOptions(rows: readonly Category[], currentId?: string): Category[] {
  // تنها خود رکورد و نوادگانش مقصد/والد نامعتبراند (حلقه). نیاکان مقصدهای
  // کاملاً معتبر جابهجاییاند؛ مثلاً نوه میتواند مستقیماً زیر ریشه برود.
  const excluded = currentId ? descendantIds(rows, currentId) : new Set<string>();
  return rows
    .filter((r) => r.is_active !== false && !excluded.has(r.id))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** برچسب مسیر کامل دسته برای نمایش RTL. */
export function categoryPathLabel(rows: readonly Category[], id: string): string {
  const chain = [...categoryPath(rows, id), ...rows.filter((r) => r.id === id)];
  return chain.map((r) => r.name).join(' › ');
}
