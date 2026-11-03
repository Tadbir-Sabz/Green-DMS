/**
 * ترکیب کلاس‌های Tailwind بدون وابستگی خارجی.
 *
 * رشته‌ها را همان‌طور می‌پیوندد و آبجکت‌ها را به‌صورت شرطی
 * (`{ 'bg-brand': active }`) می‌پذیرد؛ مقادیر تهی/دروغین نادیده گرفته می‌شوند.
 * عمداً از clsx/tailwind-merge استفاده نمی‌کند تا وابستگی جدیدی به lockfile
 * اضافه نشود — چون کلاس‌ها در این طراحی از توکن‌های معنایی می‌آیند، تعارض
 * «آخرین کلاس برنده» عملاً رخ نمی‌دهد.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, unknown>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out.push(trimmed);
      return;
    }
    if (typeof value === 'number') {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === 'object') {
      for (const [key, active] of Object.entries(value)) {
        if (active) walk(key);
      }
    }
  };

  for (const input of inputs) walk(input);
  // کلاس‌های تکراری را حذف می‌کند تا خروجی تمیز بماند
  return [...new Set(out)].join(' ');
}
