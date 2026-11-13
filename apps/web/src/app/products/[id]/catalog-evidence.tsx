"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { components } from "@dms/api-client";
import { api } from "@/lib/api";
import {
  btnGhost,
  errorCls,
  faError,
  panelCls,
  statusBadgeCls,
  warnCls,
} from "../products-lib";

type HistoryPage = components["schemas"]["ProductCatalogHistoryPage"];
type ProductDomainScope = components["schemas"]["ProductDomainScope"];
const ACTION: Record<string, string> = {
  INSERT: "ایجاد",
  UPDATE: "ویرایش",
  DELETE: "حذف",
};
const ENTITY: Record<string, string> = {
  product: "کالا",
  product_alias: "نام جایگزین",
  product_attribute_value: "مقدار صفت",
  product_barcode: "بارکد",
  product_packaging: "بسته‌بندی",
  product_bundle: "ترکیب بسته",
  product_relation: "رابطه",
};

export function CatalogHistory({ productId }: { productId: string }) {
  const [items, setItems] = useState<HistoryPage["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      setError("");
      try {
        const { data, error: err } = await api.GET("/products/{id}/history", {
          params: {
            path: { id: productId },
            query: { limit: 30, ...(before ? { before } : {}) },
          },
        });
        if (err || !data) {
          setError(faError(err));
          return;
        }
        setItems((old) => (before ? [...old, ...data.items] : data.items));
        setCursor(data.next_cursor);
        setLoaded(true);
      } catch {
        setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      } finally {
        setBusy(false);
      }
    },
    [productId],
  );
  useEffect(() => {
    setItems([]);
    setLoaded(false);
    void load();
  }, [load]);
  return (
    <section className={panelCls} aria-label="تاریخچه کالا" aria-busy={busy}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">تاریخچه تغییرات مرکزی</h2>
        <button
          className={btnGhost}
          disabled={busy}
          onClick={() => void load()}
        >
          تازه‌سازی
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        رویداد و تغییر کالا در یک تراکنش ثبت می‌شوند. این بخش فقط از زمان
        فعال‌سازی تاریخچه کاتالوگ را نشان می‌دهد؛ سابقه قدیمی بازسازی نشده است.
        اطلاعات قیمت و موجودی متعلق به این کاتالوگ نیست.
      </p>
      {error && (
        <p role="alert" className={errorCls}>
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت تاریخچه…</p>}
      {loaded && !busy && !items.length && (
        <p className="py-6 text-ink-muted">
          هنوز تغییری در تاریخچه جدید ثبت نشده است.
        </p>
      )}
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                {ACTION[item.action]} ·{" "}
                {ENTITY[item.entity_type] ?? item.entity_type}
              </strong>
              <time dateTime={item.at}>
                {new Date(item.at).toLocaleString("fa-IR")}
              </time>
            </div>
            <p className="mt-2 break-all text-xs text-ink-muted">
              شناسه رویداد: {item.id} · کاربر:{" "}
              <bdi>{item.actor_user_id ?? "ثبت سیستمی / ناشناخته"}</bdi>
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer focus-ring">
                مشاهده داده قبل و بعد
              </summary>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {[
                  ["قبل", item.before_data],
                  ["بعد", item.after_data],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <h3 className="text-sm font-medium">{String(label)}</h3>
                    <pre
                      dir="ltr"
                      className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-alt p-3 text-start text-xs"
                    >
                      {value ? JSON.stringify(value, null, 2) : "—"}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {cursor && (
        <button
          disabled={busy}
          className={`${btnGhost} mt-4`}
          onClick={() => void load(cursor)}
        >
          رویدادهای قدیمی‌تر
        </button>
      )}
    </section>
  );
}

export function DomainIntegrationStatus({ productId }: { productId: string }) {
  const [scope, setScope] = useState<ProductDomainScope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await api.GET("/products/{id}/domain-scope", {
        params: { path: { id: productId } },
      });
      if (err) {
        setScope(null);
        setError(faError(err));
        return;
      }
      // پاسخ بدون بدنه ⇒ وضعیت خالی صادقانه، نه خطا و نه دادهٔ ساختگی.
      if (!data) {
        setScope(null);
        setError("");
        return;
      }
      setScope(data);
    } catch {
      setScope(null);
      setError("دریافت مرز مرکزی/دامنهای ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={panelCls} aria-labelledby="domain-scope-title">
      <h2 id="domain-scope-title" className="mb-3 font-semibold">
        مرز کاتالوگ مرکزی و دامنه عملیاتی
      </h2>
      {error ? (
        <div role="alert" className={errorCls}>
          <p>{error}</p>
          <button
            type="button"
            className={`${btnGhost} mt-3`}
            onClick={() => void load()}
          >
            تلاش دوباره
          </button>
        </div>
      ) : loading ? (
        <p role="status">در حال دریافت مرز مرکزی/دامنهای…</p>
      ) : !scope ? (
        <p role="status" className={warnCls}>
          پاسخ معتبری دریافت نشد؛ هیچ وضعیت دامنهای فرض نمیشود.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-line bg-surface-alt p-3">
              <h3 className="text-sm font-semibold">
                وضعیت مرکزی کالا (سراسری شرکت)
              </h3>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span className={statusBadgeCls(scope.central_status)}>
                  {scope.central_status_label_fa}
                </span>
                <span className="font-mono text-xs text-ink-muted" dir="ltr">
                  {scope.central_status}
                </span>
              </p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                این وضعیت، چرخهٔ حیات مرکزی کالاست و به هیچ دامنهای اختصاص
                ندارد.
              </p>
            </article>
            <article className="rounded-lg border border-warning-line bg-warning-soft p-3">
              <h3 className="text-sm font-semibold">عرضه در دامنه عملیاتی</h3>
              <p className={`mt-2 ${warnCls}`}>تعیین نشده</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                {scope.message_fa}
              </p>
            </article>
          </div>
          <p className="mt-4 text-sm leading-7 text-ink-muted">
            {scope.central_status_is_domain_availability === false &&
              "فعال بودن مرکزی بهمعنای عرضه در تمام دامنهها نیست. "}
            در این وضعیت امکان افزودن یا تغییر عضویت دامنه وجود ندارد. هیچ دامنه
            یا دسترسی عرضهای از روی شرکت، شعبه یا دامنه قیمتگذاری ساخته نشده
            است. تعداد تصمیمهای باز مالک:{" "}
            <bdi>{scope.owner_decisions.length}</bdi>.
          </p>
        </>
      )}
      <Link className={`${btnGhost} mt-4`} href="/products/domain-integration">
        جزئیات تصمیمها و وضعیت
      </Link>
    </section>
  );
}
