"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { components, paths } from "@dms/api-client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  inputCls,
  panelCls,
  selectCls,
  warnCls,
} from "../products-lib";

type HistoryPage = components["schemas"]["ProductCatalogHistoryPage"];
type HistoryItem = HistoryPage["items"][number];
type HistoryQuery = NonNullable<
  NonNullable<paths["/product-catalog/history"]["get"]["parameters"]>["query"]
>;
type EntityType = NonNullable<HistoryQuery["entity_type"]>;

const ENTITY_TYPES: EntityType[] = [
  "product",
  "product_category",
  "product_family",
  "product_alias",
  "product_attribute_def",
  "product_attribute_enum_value",
  "product_attribute_value",
  "product_relation",
  "product_bundle",
  "product_barcode",
  "product_packaging",
];

const ENTITY_LABELS: Record<EntityType, string> = {
  product: "کالا",
  product_category: "گروه کالا",
  product_family: "خانواده کالا",
  product_alias: "نام جایگزین",
  product_attribute_def: "تعریف صفت",
  product_attribute_enum_value: "مقدار صفت انتخابی",
  product_attribute_value: "مقدار صفت کالا",
  product_relation: "رابطه کالا",
  product_bundle: "ترکیب بسته",
  product_barcode: "بارکد",
  product_packaging: "بستهبندی",
};

const ACTION_LABELS: Record<HistoryItem["action"], string> = {
  INSERT: "ایجاد",
  UPDATE: "ویرایش",
  DELETE: "حذف",
};

type Filters = { entityType: "" | EntityType; productId: string };
const EMPTY_FILTERS: Filters = { entityType: "", productId: "" };

function queryFor(filters: Filters, before?: string): HistoryQuery {
  const query: HistoryQuery = { limit: 30 };
  if (filters.entityType) query.entity_type = filters.entityType;
  if (filters.productId.trim()) query.product_id = filters.productId.trim();
  if (before) query.before = before;
  return query;
}

export default function CatalogHistoryPage(): React.JSX.Element {
  const auth = useAuth();
  const canView =
    !auth.isLoading && auth.hasPermission("master.product.view");
  const [entityType, setEntityType] = useState<"" | EntityType>("");
  const [productId, setProductId] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (activeFilters: Filters, before?: string) => {
      if (!canView) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await api.GET("/product-catalog/history", {
          params: { query: queryFor(activeFilters, before) },
        });
        if (result.error || !result.data) {
          setError(faError(result.error));
          setLoaded(false);
          return;
        }
        const page = result.data as HistoryPage;
        setItems((previous) =>
          before ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.has_more ? page.next_cursor : null);
        setLoaded(true);
      } catch {
        setError("دریافت تاریخچه سراسری ناموفق بود.");
        setLoaded(false);
      } finally {
        setLoading(false);
      }
    },
    [canView],
  );

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  function applyFilters(event: FormEvent): void {
    event.preventDefault();
    setItems([]);
    setCursor(null);
    setLoaded(false);
    setFilters({ entityType, productId: productId.trim() });
  }

  function clearFilters(): void {
    setEntityType("");
    setProductId("");
    setItems([]);
    setCursor(null);
    setLoaded(false);
    setFilters({ entityType: "", productId: "" });
  }

  if (auth.isLoading) {
    return (
      <main dir="rtl" lang="fa" className="mx-auto max-w-7xl p-4 sm:p-6">
        <p role="status" className={panelCls}>
          در حال بررسی مجوز نشست…
        </p>
      </main>
    );
  }

  if (!canView) {
    return (
      <main dir="rtl" lang="fa" className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <h1 className="text-xl font-semibold">تاریخچه سراسری کاتالوگ مرکزی</h1>
        <section className={panelCls} aria-labelledby="history-permission-title">
          <h2 id="history-permission-title" className="font-semibold">
            دسترسی به تاریخچه کاتالوگ مجاز نیست
          </h2>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            برای مشاهده این گزارش، مجوز <bdi>master.product.view</bdi> لازم
            است. هیچ درخواست تاریخچهای بدون مجوز ارسال نشده است.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" lang="fa" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            تاریخچه سراسری کاتالوگ مرکزی
          </h1>
          <p className="mt-1 text-sm leading-7 text-ink-muted">
            رویدادهای تغییرناپذیر هویت، صفات، خانوادهها و گروههای کالا در محدوده شرکت
          </p>
        </div>
        <Link className={btnGhost} href="/products">
          بازگشت به کاتالوگ
        </Link>
      </header>

      <section className="rounded-xl border border-info-line bg-info-soft p-4 sm:p-5">
        <h2 className="font-semibold">مرز این گزارش</h2>
        <p className="mt-2 text-sm leading-7 text-ink">
          فقط رویدادهای مرکزی ثبتشده از زمان مهاجرت <bdi>0060</bdi> نمایش داده
          میشوند؛ سابقهای بازسازی نشده است. تاریخچه عضویت دامنه، قیمتگذاری،
          موجودی و اسناد مالی در این نمای سراسری وجود ندارد.
        </p>
      </section>

      <form
        onSubmit={applyFilters}
        className={`${panelCls} grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]`}
        aria-label="فیلتر تاریخچه کاتالوگ"
      >
        <label className="text-sm">
          نوع رویداد
          <select
            className={`${selectCls} mt-1`}
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as "" | EntityType)
            }
          >
            <option value="">همه رویدادهای مرکزی</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTITY_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          شناسه کالا (اختیاری)
          <input
            className={`${inputCls} mt-1 font-mono`}
            dir="ltr"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            placeholder="UUID کالا"
            autoComplete="off"
          />
        </label>
        <button type="submit" className={`${btnPrimary} self-end`} disabled={loading}>
          اعمال فیلتر
        </button>
        <button
          type="button"
          className={`${btnGhost} self-end`}
          onClick={clearFilters}
          disabled={loading}
        >
          پاکسازی
        </button>
      </form>

      {error && (
        <div role="alert" className={errorCls}>
          <p>{error}</p>
          <button
            type="button"
            className={`${btnGhost} mt-3`}
            onClick={() => void load(filters)}
          >
            تلاش دوباره
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">رویدادها</h2>
        <button
          type="button"
          className={btnGhost}
          disabled={loading}
          onClick={() => void load(filters)}
        >
          تازهسازی
        </button>
      </div>

      {loading && <p role="status">در حال دریافت تاریخچه…</p>}
      {!loading && loaded && !error && items.length === 0 && (
        <p role="status" className={warnCls}>
          هیچ رویداد کاتالوگ مرکزی با این فیلترها یافت نشد؛ رویداد ساختگی ساخته
          نمیشود.
        </p>
      )}

      <ol className="space-y-3" aria-label="رویدادهای تاریخچه کاتالوگ">
        {items.map((item) => (
          <li key={item.id} className={panelCls}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <strong>
                  {ACTION_LABELS[item.action]} · {ENTITY_LABELS[item.entity_type]}
                </strong>
                <p className="mt-1 break-all text-xs text-ink-muted">
                  شناسه رویداد: <bdi>{item.id}</bdi> · کاربر:{" "}
                  <bdi>{item.actor_user_id ?? "ثبت سیستمی / ناشناخته"}</bdi>
                </p>
                <p className="mt-1 break-all text-xs text-ink-muted">
                  شناسه موجودیت: <bdi>{item.entity_id ?? "—"}</bdi>
                </p>
              </div>
              <time className="text-xs text-ink-muted" dateTime={item.at}>
                {new Date(item.at).toLocaleString("fa-IR")}
              </time>
            </div>
            {item.product_id && (
              <Link
                className={`${btnGhost} mt-3`}
                href={`/products/${item.product_id}`}
              >
                مشاهده کالا
              </Link>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer focus-ring">
                مشاهده داده قبل و بعد
              </summary>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {([
                  ["قبل", item.before_data],
                  ["بعد", item.after_data],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <h3 className="text-sm font-medium">{label}</h3>
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
          type="button"
          className={btnGhost}
          disabled={loading}
          onClick={() => void load(filters, cursor)}
        >
          رویدادهای قدیمیتر
        </button>
      )}
    </main>
  );
}
