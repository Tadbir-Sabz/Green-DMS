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
  warnCls,
} from "../products-lib";

type HistoryPage = components["schemas"]["ProductCatalogHistoryPage"];
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

export function DomainIntegrationStatus() {
  const [message, setMessage] = useState("");
  const [decisionCount, setDecisionCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api
      .GET("/product-domain-integration")
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err || !data) {
          setError(faError(err));
          return;
        }
        setMessage(data.message_fa);
        setDecisionCount(data.owner_decisions?.length ?? null);
      })
      .catch(() => {
        if (live) setError("دریافت وضعیت اتصال دامنه ناموفق بود.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className={panelCls}>
      <h2 className="mb-3 font-semibold">کاتالوگ دامنه عملیاتی</h2>
      {error ? (
        <p role="alert" className={errorCls}>
          {error}
        </p>
      ) : message ? (
        <p className={warnCls}>{message}</p>
      ) : (
        <p role="status">در حال دریافت وضعیت اتصال…</p>
      )}
      <p className="mt-4 text-sm text-ink-muted">
        در این وضعیت امکان افزودن یا تغییر عضویت دامنه وجود ندارد. هیچ دامنه یا
        دسترسی عرضهای از روی شرکت، شعبه یا دامنه قیمتگذاری ساخته نشده است.
        {decisionCount !== null && (
          <> تعداد تصمیمهای باز مالک: <bdi>{decisionCount}</bdi>.</>
        )}
      </p>
      <Link
        className={`${btnGhost} mt-4`}
        href="/products/domain-integration"
      >
        جزئیات تصمیمها و وضعیت
      </Link>
    </section>
  );
}
