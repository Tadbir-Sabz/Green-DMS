"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { components } from "@dms/api-client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  panelCls,
  warnCls,
} from "../products-lib";

type DomainStatus = components["schemas"]["DomainCatalogContractStatus"];

const DECISION_LABELS: Record<string, string> = {
  "PM-B1": "شناسه و مالکیت دامنه",
  "PM-B2": "چرخه حیات و فعال یا غیرفعال بودن دامنه",
  "PM-B3": "مجوز فهرست و جستوجوی دامنهها",
  "PM-B4": "اختیار مدیریت مرکزی در برابر مدیریت دامنهای",
  "PM-B5": "ایجاد، حذف و غیرفعالسازی عضویت کالا",
  "PM-B6": "نمایش کالاهای ثبتنشده در دامنه",
  "PM-B7": "نگهداری تاریخچه پس از بازنشستگی دامنه",
  "PM-B8": "نمایش جزئیات و تاریخچه بین دامنهای",
};

const CONTRACT_LABELS: Record<string, string> = {
  "stable company-scoped identity and lifecycle":
    "هویت و چرخه حیات پایدار در محدوده شرکت",
  "server-side actor-to-domain authorization resolution":
    "احراز اختیار کاربر به دامنه در سمت سرور",
  "domain list/search and resolve APIs with approved explicit permissions":
    "فهرست، جستوجو و تفکیک دامنه با مجوزهای صریح مصوب",
  "membership state, transition and immutable-history semantics":
    "وضعیت، گذارها و تاریخچه تغییرناپذیر عضویت",
  "privacy rules for absent products and cross-domain history":
    "قواعد محرمانگی کالاهای غایب و تاریخچه بین دامنهای",
  "same-company FKs, uniqueness, indexes, RLS and additive migration rollback":
    "همشرکتی کلیدها، یکتایی، ایندکس، RLS و مهاجرت افزودنی با بازگشت",
};

const BLOCKED_WORKFLOW = [
  {
    title: "مشاهده عضویت بر اساس دامنه",
    detail: "تا تعیین مرجع معتبر، هیچ فهرست دامنه یا عضویتی بارگذاری نمیشود.",
  },
  {
    title: "کالاهای در دسترس دامنه انتخابشده",
    detail: "فعال بودن مرکزی، عرضه در دامنه محسوب نمیشود و وضعیتی ساخته نمیشود.",
  },
  {
    title: "افزودن کالای مرکزی به دامنه",
    detail: "شناسه کالا بدون تصمیم مالک و قرارداد اختیار، قابل ثبت نیست.",
  },
  {
    title: "تغییر وضعیت دامنهای",
    detail: "تغییر دسترسپذیری محلی، حذف و غیرفعالسازی همگی بسته هستند.",
  },
  {
    title: "تاریخچه عضویت",
    detail: "هیچ رویداد ساختگی یا بازنویسی تاریخچه کاتالوگ مرکزی انجام نمیشود.",
  },
];

export default function DomainIntegrationPage() {
  const auth = useAuth();
  const canView = !auth.isLoading && auth.hasPermission("master.product.view");
  const canWrite = !auth.isLoading && auth.hasPermission("master.product.update");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.GET("/product-domain-integration");
      if (result.error || !result.data) {
        setStatus(null);
        setError(faError(result.error));
        return;
      }
      setStatus(result.data);
    } catch {
      setStatus(null);
      setError("دریافت وضعیت اتصال دامنه ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const decisions = status?.owner_decisions ?? [];
  const technical = status?.technical_contract ?? [];
  const documentUrl =
    status?.decision_document_url ??
    "https://github.com/Tadbir-Sabz/Green-DMS/blob/arena/be5eaff3-green-dms/docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md";

  return (
    <main dir="rtl" lang="fa" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            اتصال کاتالوگ به دامنه عملیاتی
          </h1>
          <p className="mt-1 text-sm leading-7 text-ink-muted">
            وضعیت قرارداد، تصمیمهای مالک و مرزهای بسته جریان کاری دامنه
          </p>
        </div>
        <Link className={btnGhost} href="/products">
          بازگشت به کاتالوگ
        </Link>
      </header>

      {auth.isLoading ? (
        <p role="status" className={panelCls}>
          در حال بررسی مجوز نشست…
        </p>
      ) : !canView ? (
        <section className={panelCls} aria-labelledby="domain-permission-title">
          <h2 id="domain-permission-title" className="font-semibold">
            دسترسی به وضعیت اتصال مجاز نیست
          </h2>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            برای مشاهده این صفحه، مجوز <bdi>master.product.view</bdi> لازم است.
            هیچ درخواست دامنهای بدون مجوز ارسال نشده است.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-warning-line bg-warning-soft p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-warning-line bg-surface px-3 py-1 text-xs font-medium text-warning-ink">
                جریان کاری غیرفعال
              </span>
              <span className="text-sm text-ink-muted">
                <bdi>{status?.code ?? "در انتظار پاسخ سرور"}</bdi>
              </span>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-ink">
              تصمیم مالک و مرجع معتبر دامنه لازم است
            </h2>
            <p className="mt-2 text-sm leading-7 text-ink">
              {status?.message_fa ??
                "وضعیت اتصال در حال دریافت است."}
            </p>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              دامنه قیمتگذاری، شعبه، انبار، شرکت، برچسب دلخواه و شناسه سیاست
              تأیید، جایگزین هویت دامنه کاتالوگ نیست. هیچ دامنه یا عضویت
              ساختگی در این صفحه نمایش داده نمیشود.
            </p>
            <a
              className="mt-4 inline-flex rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm text-ink hover:bg-surface-hover focus-ring"
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
            >
              سند تصمیمهای مالک
            </a>
          </section>

          {error && (
            <div role="alert" className={errorCls}>
              <p>{error}</p>
              <button
                type="button"
                className={`${btnPrimary} mt-3`}
                onClick={() => void load()}
              >
                تلاش دوباره
              </button>
            </div>
          )}
          {loading && (
            <p role="status" className={panelCls}>
              در حال دریافت وضعیت اتصال…
            </p>
          )}

          {!loading && !error && !status && (
            <p role="status" className={warnCls}>
              پاسخ معتبری از سرور دریافت نشد؛ هیچ وضعیت دامنهای فرض نمیشود.
            </p>
          )}

          {status && !error && (
            <>
              <section aria-labelledby="central-domain-title" className="space-y-3">
                <h2 id="central-domain-title" className="text-lg font-semibold">
                  تفکیک هویت مرکزی از دسترسپذیری دامنهای
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <article className={panelCls}>
                    <h3 className="font-semibold">کالای مرکزی</h3>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">
                      شناسه و کد کالا همچنان در مالکیت شرکت و یکتا باقی میماند؛
                      کالا برای هر دامنه تکثیر نمیشود.
                    </p>
                  </article>
                  <article className={panelCls}>
                    <h3 className="font-semibold">عرضه در دامنه</h3>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">
                      عضویت و دسترسپذیری محلی، لایهای جدا است. فعال بودن مرکزی
                      هرگز به معنی عرضه خودکار در تمام دامنهها نیست.
                    </p>
                  </article>
                </div>
              </section>

              <section aria-labelledby="decision-title" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 id="decision-title" className="text-lg font-semibold">
                    تصمیمهای لازم از مالک کسبوکار
                  </h2>
                  <p className="text-sm text-ink-muted">
                    <bdi>{decisions.length}</bdi> مورد · هیچکدام تأیید نشدهاند
                  </p>
                </div>
                {decisions.length === 0 ? (
                  <p role="status" className={warnCls}>
                    فهرست تصمیمها در پاسخ سرور خالی است.
                  </p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {decisions.map((decision) => (
                      <li key={decision.id} className={panelCls}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <bdi className="text-sm font-medium text-ink">
                            {decision.id}
                          </bdi>
                          <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-muted">
                            در انتظار تصمیم
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-ink">
                          {DECISION_LABELS[decision.id] ?? decision.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="workflow-title" className="space-y-3">
                <h2 id="workflow-title" className="text-lg font-semibold">
                  جریان کاری مسدودشده
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {BLOCKED_WORKFLOW.map((item) => (
                    <li key={item.title} className={panelCls}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">{item.title}</h3>
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger-ink">
                          مسدود
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-ink-muted">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-sm leading-7 text-ink-muted">
                  {canWrite
                    ? "با وجود مجوز ویرایش مرکزی، هیچ نوشتن دامنهای اجرا یا شبیهسازی نمیشود."
                    : "بدون مجوز ویرایش مرکزی نیز هیچ نوشتن دامنهای اجرا یا شبیهسازی نمیشود."}
                </p>
              </section>

              <section aria-labelledby="technical-title" className="space-y-3">
                <h2 id="technical-title" className="text-lg font-semibold">
                  پیشنیازهای فنی پس از تصمیم مالک
                </h2>
                {technical.length === 0 ? (
                  <p role="status" className={warnCls}>
                    فهرست پیشنیازهای فنی در پاسخ سرور خالی است.
                  </p>
                ) : (
                  <ol className="grid gap-2 md:grid-cols-2">
                    {technical.map((item) => (
                      <li key={item} className="flex gap-3 rounded-lg border border-line bg-surface p-3 text-sm leading-7">
                        <span aria-hidden="true" className="text-ink-muted">
                          •
                        </span>
                        <span>{CONTRACT_LABELS[item] ?? item}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
