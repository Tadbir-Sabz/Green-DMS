"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  ProgressBar,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  TRANSFER_STATUS_LABELS_FA,
  cancelTransferOperation,
  checkImportExecutionGate,
  createExportPreview,
  createImportPreview,
  downloadExportPackage,
  formatBytesFa,
  formatDateTimeFa,
  getImportPreview,
  getTransferHistory,
  getTransferOperationDetail,
  getTransferOwnerTypes,
  getTransferOwners,
  updateImportMappings,
  type TransferExportPreview,
  type TransferHistoryItem,
  type TransferImportPreview,
  type TransferMappingOverride,
  type TransferOperationDetail,
  type TransferOwnerRecord,
  type TransferOwnerType,
  type TransferOwnerTypeOption,
  type TransferSelection,
} from "@/lib/attachment-transfer";

/**
 * مرکز انتقال ضمائم چندموجودیتی (TASK-PM-02-C4) — Persian-first/RTL.
 *
 * هر کنترل پشت سرور واقعی دارد: انتخاب نوع/رکورد، پیشنمایش صدور، دانلود
 * باینری، بارگذاری/بازرسی، نگاشت صریح، بررسی دروازهٔ اجرای fail-closed، لغو،
 * و تاریخچهٔ ممیزی. دکمهٔ «اجرای ورود» عمداً وجود ندارد چون سیاست/اثرانگشت
 * دونفرهٔ مصوب برای بسته تعریف نشده است؛ «بررسی دروازهٔ اجرا» فقط همان ۴۰۹
 * واقعی سرور را نمایش میدهد. هیچ کنترل حذف، بایگانی، جایگزینی، ساخت مالک،
 * تغییر شرکت، تأیید بدلی یا Product Master وجود ندارد.
 */

type TabId = "export" | "import" | "history";
const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "export", label: "مرکز صدور", hint: "انتخاب رکوردها و ساخت بستهٔ کنترلشده" },
  { id: "import", label: "مرکز ورود", hint: "بارگذاری، بازرسی و پیشنمایش امن" },
  { id: "history", label: "تاریخچه و ممیزی", hint: "عملیات، رویدادها و خطاهای امن" },
];

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info" | "brand"> = {
  accepted: "success",
  completed: "success",
  approved: "success",
  rejected: "danger",
  failed: "danger",
  duplicate: "warning",
  unresolved: "warning",
  pending: "warning",
  blocked: "danger",
  cancelled: "neutral",
  preview: "info",
  approval: "info",
  execution: "info",
  download: "info",
  failure: "danger",
  cancellation: "neutral",
  export: "brand",
  import: "brand",
};

const OWNER_LABELS_FA: Record<TransferOwnerType, string> = {
  product: "کالا",
  invoice: "فاکتور فروش",
  sales_order: "سفارش فروش",
  return_request: "درخواست مرجوعی",
  stock_count: "سند انبارگردانی",
  journal_entry: "سند حسابداری",
  receipt: "رسید پرداخت",
  pod: "مدرک تحویل",
};

const shortId = (id: string): string => `${id.slice(0, 8)}…`;

function StateBadge({ value }: { value: string }) {
  return (
    <Badge tone={STATUS_TONE[value] ?? "neutral"} size="sm" dot>
      {TRANSFER_STATUS_LABELS_FA[value] ?? value}
    </Badge>
  );
}

function KeyValue({ label, value, ltr = false }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 last:border-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span dir={ltr ? "ltr" : "auto"} className="max-w-full break-words text-[13px] font-medium text-ink">
        {value}
      </span>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      <span>راهنمای حالتها:</span>
      {["accepted", "rejected", "duplicate", "unresolved", "pending", "approved", "completed", "failed", "blocked"].map((status) => (
        <StateBadge key={status} value={status} />
      ))}
      <span>«در انتظار سیاست» و «تأییدشده» تا تصمیم مصوب مالک غیرفعالاند.</span>
    </div>
  );
}

function TransferTabs({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div role="tablist" aria-label="بخشهای مرکز انتقال ضمائم" className="flex flex-wrap gap-1 border-b border-line">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          title={item.hint}
          onClick={() => onChange(item.id)}
          className={`focus-ring px-4 py-2.5 text-sm rounded-t-xl border-b-2 -mb-px transition-colors ${
            tab === item.id
              ? "border-brand text-brand-soft-ink font-semibold"
              : "border-transparent text-ink-muted hover:text-ink hover:bg-surface-hover"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ExportCenter({
  ownerTypes,
  ownerTypesLoading,
  ownerTypesError,
  retryOwnerTypes,
  canViewProducts,
  onOperationCompleted,
}: {
  ownerTypes: TransferOwnerTypeOption[];
  ownerTypesLoading: boolean;
  ownerTypesError: string;
  retryOwnerTypes: () => void;
  canViewProducts: boolean;
  onOperationCompleted: () => void;
}) {
  const [selectedTypes, setSelectedTypes] = useState<TransferOwnerType[]>([]);
  const [q, setQ] = useState("");
  const [owners, setOwners] = useState<TransferOwnerRecord[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<TransferExportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const effectiveTypes = useMemo(
    () => selectedTypes.filter((type) => canViewProducts || type !== "product"),
    [selectedTypes, canViewProducts],
  );

  const loadOwners = useCallback(async (search = "") => {
    setOwnersLoading(true);
    setOwnersError("");
    try {
      const result = await getTransferOwners(effectiveTypes, search, 40);
      setOwners(result.items);
      setChecked((old) => {
        const next: Record<string, boolean> = {};
        for (const item of result.items) {
          const key = `${item.owner_type}:${item.owner_id}`;
          next[key] = old[key] ?? false;
        }
        return next;
      });
    } catch (err) {
      setOwners([]);
      setOwnersError(err instanceof Error ? err.message : "دریافت رکوردهای مجاز ناموفق بود.");
    } finally {
      setOwnersLoading(false);
    }
  }, [effectiveTypes]);

  useEffect(() => {
    if (ownerTypes.length > 0 && selectedTypes.length === 0) {
      setSelectedTypes(ownerTypes.map((item) => item.owner_type).filter((type) => canViewProducts || type !== "product"));
    }
  }, [ownerTypes, selectedTypes.length, canViewProducts]);

  useEffect(() => {
    void loadOwners("");
  }, [loadOwners]);

  const selections: TransferSelection[] = owners
    .filter((item) => checked[`${item.owner_type}:${item.owner_id}`])
    .map((item) => ({ owner_type: item.owner_type, owner_id: item.owner_id }));

  const createPreview = async () => {
    setError("");
    setNotice("");
    if (selections.length === 0) {
      setError("دستکم یک رکورد مالک مجاز را انتخاب کنید.");
      return;
    }
    setBusy(true);
    try {
      const result = await createExportPreview(selections);
      setPreview(result);
      setNotice(result.downloads_available
        ? "بستهٔ کنترلشده آماده است؛manifest و هش یکپارچگی ثبت شد."
        : "هیچ ضمیمهٔ واجدشرایطی برای رکوردهای انتخابشده یافت نشد.");
      onOperationCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "پیشنمایش صدور ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!preview?.downloads_available) return;
    setError("");
    setBusy(true);
    try {
      const result = await downloadExportPackage(preview.operation_id);
      setNotice(`بسته «${result.filename}» (${formatBytesFa(result.size)}) تحویل شد. هش: ${result.sha256 ?? "—"}`);
      onOperationCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "دانلود بسته ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" role="tabpanel" aria-label="مرکز صدور">
      <Card>
        <CardBody>
          <SectionTitle>۱. انتخاب انواع موجودیت و رکوردهای مجاز</SectionTitle>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            تنها هشت نوع مالک مصوب C1/C3 نمایش داده میشوند. برند، دستهبندی، انبار، واحد اندازهگیری و
            <span dir="ltr"> other </span>
            پشتیبانی نمیشوند. رکوردها فقط از همان شرکت و با مجوزهای موجود خوانده میشوند.
          </p>
          {ownerTypesLoading ? (
            <div className="py-6"><Spinner label="در حال دریافت انواع مجاز…" /></div>
          ) : ownerTypesError ? (
            <ErrorState message={ownerTypesError} onRetry={retryOwnerTypes} compact />
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ownerTypes.map((item) => {
                const disabled = item.owner_type === "product" && !canViewProducts;
                return (
                  <Checkbox
                    key={item.owner_type}
                    checked={!disabled && selectedTypes.includes(item.owner_type)}
                    disabled={disabled}
                    label={item.label_fa}
                    description={disabled ? "مجوز master.product.view لازم است." : item.note_fa}
                    onChange={(event) => {
                      const type = item.owner_type;
                      setSelectedTypes((old) => event.target.checked
                        ? [...new Set([...old, type])]
                        : old.filter((value) => value !== type));
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1">
              <label htmlFor="transfer-owner-search" className="text-xs text-ink-muted">جستوجوی شماره/عنوان رکورد</label>
              <Input
                id="transfer-owner-search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="مثلاً شماره فاکتور"
                className="mt-1"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadOwners(q)} disabled={ownersLoading}>
              جستوجو
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setQ(""); void loadOwners(""); }} disabled={ownersLoading}>
              پاک کردن
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>۲. رکوردها و ضمائم وابسته</SectionTitle>
            <Badge tone="info" size="sm">{`${selections.length.toLocaleString("fa-IR")} رکورد انتخابشده`}</Badge>
          </div>
          {ownersLoading ? (
            <div className="py-8"><Spinner label="در حال دریافت رکوردهای مجاز…" /></div>
          ) : ownersError ? (
            <ErrorState message={ownersError} onRetry={() => void loadOwners(q)} compact />
          ) : owners.length === 0 ? (
            <EmptyState compact title="رکوردی یافت نشد" description="نوع موجودیت یا عبارت جستوجو را تغییر دهید." />
          ) : (
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">انتخاب</th>
                    <th className="px-3 py-2 text-start font-medium">نوع مالک</th>
                    <th className="px-3 py-2 text-start font-medium">شماره / عنوان</th>
                    <th className="px-3 py-2 text-start font-medium">ضمائم</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((item) => {
                    const key = `${item.owner_type}:${item.owner_id}`;
                    return (
                      <tr key={key} className="border-t border-line hover:bg-surface-hover">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`انتخاب ${item.label_fa} ${item.reference}`}
                            checked={Boolean(checked[key])}
                            onChange={(event) => setChecked((old) => ({ ...old, [key]: event.target.checked }))}
                            className="size-4 accent-brand"
                          />
                        </td>
                        <td className="px-3 py-2">{item.label_fa}</td>
                        <td className="px-3 py-2">
                          <span dir="auto">{item.reference}</span>
                          <span className="ms-2 text-xs text-ink-subtle" dir="auto">{item.title_fa}</span>
                          <span dir="ltr" className="ms-2 font-mono text-[10px] text-ink-subtle">{shortId(item.owner_id)}</span>
                        </td>
                        <td className="px-3 py-2">{item.attachment_count.toLocaleString("fa-IR")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void createPreview()} disabled={busy || selections.length === 0} loading={busy}>
              پیشنمایش و ساختmanifest
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setPreview(null); setNotice(""); setError(""); setChecked({}); }}
              disabled={busy}
            >
              پاک کردن پیشنمایش
            </Button>
          </div>
          {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
          {notice && <div className="mt-3"><Alert tone="success">{notice}</Alert></div>}
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>۳. محتوای بسته و اندازهٔ تخمینی</SectionTitle>
              <StateBadge value={preview.execution_status} />
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <KeyValue label="شناسهٔ عملیات" value={shortId(preview.operation_id)} ltr />
                <KeyValue label="تعداد فایلها" value={preview.file_count.toLocaleString("fa-IR")} />
                <KeyValue label="حجم فایلها" value={formatBytesFa(preview.total_bytes)} />
                <KeyValue label="اندازهٔ تخمینی بسته" value={formatBytesFa(preview.estimated_package_size_bytes)} />
                <KeyValue label="فایلهای ردشده" value={preview.rejected_count.toLocaleString("fa-IR")} />
                <KeyValue label="زمان ایجاد" value={formatDateTimeFa(preview.created_at)} />
              </div>
              <div>
                <KeyValue label="نسخهٔmanifest" value={preview.manifest?.schema ?? "—"} ltr />
                <KeyValue label="هش manifest" value={preview.manifest?.checksums.manifest_sha256 ?? "—"} ltr />
                <KeyValue label="هش بسته" value={preview.manifest?.checksums.package_sha256 ?? "—"} ltr />
                <KeyValue label="انواع موجودیت" value={preview.entity_types.map((type) => OWNER_LABELS_FA[type]).join("، ")} />
                <KeyValue label="وضعیت دانلود" value={preview.downloads_available ? "آماده" : "بدون فایل واجدشرایط"} />
              </div>
            </div>
            {preview.manifest && (
              <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">نام فایل</th>
                      <th className="px-3 py-2 text-start font-medium">نوع</th>
                      <th className="px-3 py-2 text-start font-medium">حجم</th>
                      <th className="px-3 py-2 text-start font-medium">مرجع مالک</th>
                      <th className="px-3 py-2 text-start font-medium">SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.manifest.files.map((file) => (
                      <tr key={file.path} className="border-t border-line">
                        <td className="px-3 py-2" dir="auto">{file.file_name}</td>
                        <td className="px-3 py-2" dir="ltr">{file.content_type}</td>
                        <td className="px-3 py-2">{formatBytesFa(file.size_bytes)}</td>
                        <td className="px-3 py-2">
                          {OWNER_LABELS_FA[file.owner_type]} <span dir="ltr" className="font-mono text-[10px]">{shortId(file.owner_id)}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]" dir="ltr">{file.sha256.slice(0, 12)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.rejected_files.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-danger-ink">
                {preview.rejected_files.map((item, index) => (
                  <li key={`${item.attachment_id}-${index}`} dir="auto">{item.file_name}: {item.message_fa}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => void download()}
                disabled={!preview.downloads_available || busy}
                loading={busy}
              >
                دانلود امن بستهٔ ZIP
              </Button>
              <span className="self-center text-xs text-ink-subtle">دانلود با نشست همانمبدأ و بدون URL امضاشده انجام میشود.</span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ImportCenter({
  canUpload,
  canViewProducts,
  onOperationCompleted,
}: {
  canUpload: boolean;
  canViewProducts: boolean;
  onOperationCompleted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransferImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mappingOwners, setMappingOwners] = useState<TransferOwnerRecord[]>([]);
  const [mappingOwnersError, setMappingOwnersError] = useState("");
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [gateMessage, setGateMessage] = useState("");

  const loadMappingOwners = useCallback(async (target: TransferImportPreview) => {
    const types = [...new Set(target.items.filter((item) => item.status === "unresolved").map((item) => item.owner_type))]
      .filter((type) => canViewProducts || type !== "product");
    if (types.length === 0) { setMappingOwners([]); return; }
    setMappingOwnersError("");
    try {
      const result = await getTransferOwners(types, "", 40);
      setMappingOwners(result.items);
    } catch (err) {
      setMappingOwners([]);
      setMappingOwnersError(err instanceof Error ? err.message : "دریافت رکوردهای نگاشت ناموفق بود.");
    }
  }, [canViewProducts]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    setNotice("");
    setFile(event.target.files?.[0] ?? null);
  };

  const upload = async () => {
    setError("");
    setNotice("");
    setGateMessage("");
    if (!canUpload) { setError("مجوز attachment.upload لازم است."); return; }
    if (!file) { setError("ابتدا یک بستهٔ ZIP انتخاب کنید."); return; }
    if (!/\.zip$/i.test(file.name)) { setError("پسوند بسته باید zip باشد."); return; }
    setBusy(true);
    try {
      const result = await createImportPreview(file);
      setPreview(result);
      setMappingSelections({});
      setNotice("بسته بازرسی وmanifest تأیید شد؛ پیشنمایش امن ایجاد شد.");
      await loadMappingOwners(result);
      onOperationCompleted();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "بازرسی بسته ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const retryUpload = async () => {
    if (!file) { setError("فایل بسته دوباره انتخاب کنید."); return; }
    await upload();
  };

  const applyMappings = async () => {
    if (!preview) return;
    const overrides: TransferMappingOverride[] = Object.entries(mappingSelections)
      .filter(([path, ownerId]) => {
        const item = preview.items.find((i) => i.path === path);
        return item && ownerId && ownerId !== item.owner_id;
      })
      .map(([path, ownerId]) => ({ path, owner_id: ownerId }));
    if (overrides.length === 0) { setError("نگاشت تازهای انتخاب نشده است."); return; }
    setError("");
    setBusy(true);
    try {
      const result = await updateImportMappings(preview.operation_id, overrides);
      setPreview(result);
      setNotice("نگاشت صریح اعمال و هش پیشنمایش/تأیید تازه شد؛ تأیید پیشین بیاعتبار است.");
      await loadMappingOwners(result);
      onOperationCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "اعمال نگاشت ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const reloadPreview = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await getImportPreview(preview.operation_id);
      setPreview(result);
      setNotice("پیشنمایش از سرور بازخوانی شد.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "بازخوانی پیشنمایش ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const checkGate = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const message = await checkImportExecutionGate(preview.operation_id);
      setGateMessage(message);
      setNotice("دروازهٔ اجرا بررسی شد؛ نتیجهٔ واقعی سرور در زیر نمایش داده میشود.");
      onOperationCompleted();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await cancelTransferOperation(preview.operation_id);
      setPreview(null);
      setGateMessage("");
      setNotice(result.note_fa);
      onOperationCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "لغو پیشنمایش ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const unresolved = preview?.items.filter((item) => item.status === "unresolved") ?? [];
  const step = preview ? 3 : file ? 1 : 0;

  return (
    <div className="space-y-5" role="tabpanel" aria-label="مرکز ورود">
      <Card>
        <CardBody>
          <SectionTitle>۱. بارگذاری و بازرسی بسته</SectionTitle>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            فقط بستهٔ ZIP ضمائم پذیرفته میشود. مسیرها، حجم، MIME، امضای بایتی، CRC و SHA-256،
            manifest، تکراریها و مالکیت در سرور بررسی میشوند. هیچ رکورد مالک تازهای ساخته
            یا جایگزین نمیشود.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label htmlFor="transfer-package-file" className="text-xs text-ink-muted">فایل بستهٔ ZIP</label>
              <Input
                ref={fileRef}
                id="transfer-package-file"
                type="file"
                accept=".zip,application/zip"
                onChange={onFileChange}
                disabled={!canUpload}
                className="mt-1"
              />
            </div>
            <Button type="button" onClick={() => void upload()} disabled={!canUpload || busy} loading={busy}>
              بارگذاری و پیشنمایش
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setFile(null); setPreview(null); setError(""); setNotice(""); if (fileRef.current) fileRef.current.value = ""; }} disabled={busy}>
              پاک کردن
            </Button>
          </div>
          {!canUpload && <div className="mt-3"><Alert tone="warning">مجوز attachment.upload برای پیشنمایش ورود لازم است.</Alert></div>}
          {error && (
            <div className="mt-3">
              <Alert tone="danger">{error}</Alert>
              {file && <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => void retryUpload()}>تلاش دوباره</Button>}
            </div>
          )}
          {notice && <div className="mt-3"><Alert tone="success">{notice}</Alert></div>}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>۲. پیشرفت و وضعیت تأیید</SectionTitle>
            <StateBadge value={preview ? "blocked" : "pending"} />
          </div>
          <ProgressBar value={step * 20} tone={preview ? "danger" : "brand"} label="پیشرفت پیشنمایش امن" className="mt-3" />
          <ol className="mt-4 grid gap-2 sm:grid-cols-5 text-[12px]">
            {[
              { label: "بارگذاری", done: Boolean(file) },
              { label: "بازرسی", done: Boolean(preview) },
              { label: "پیشنمایش", done: Boolean(preview) },
              { label: "تأیید دونفره", done: false, blocked: true },
              { label: "اجرای مجاز", done: false, blocked: true },
            ].map((phase) => (
              <li key={phase.label} className="rounded-lg border border-line bg-surface-alt px-2 py-3 text-center">
                <div className={phase.done ? "text-success-ink" : phase.blocked ? "text-danger-ink" : "text-ink-subtle"}>
                  {phase.label}
                </div>
                <div className="mt-1 text-[10px] text-ink-subtle">
                  {phase.done ? "انجامشده" : phase.blocked ? "مسدود" : "در انتظار"}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4"><StatusLegend /></div>
          {preview && (
            <div className="mt-4 rounded-xl border border-danger-line bg-danger-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-danger-ink">تأیید دونفره: مسدود (fail-closed)</div>
                <StateBadge value={preview.approval.status} />
              </div>
              <p className="mt-2 text-[13px] leading-6 text-danger-ink">{preview.approval.message_fa}</p>
              <p className="mt-2 text-xs leading-6 text-ink-muted">{preview.approval.required_dependency_fa}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <KeyValue label="عملیات تأیید" value={preview.approval.operation} ltr />
                <KeyValue label="اثرانگشت مصوب" value={preview.approval.fingerprint_supported ? "موجود" : "تعریفنشده"} />
                <KeyValue label="آغازکننده" value={shortId(preview.approval.initiator_user_id)} ltr />
                <KeyValue label="تأییدکنندهٔ مستقل" value="—" />
                <KeyValue label="هش بسته" value={preview.package_sha256} ltr />
                <KeyValue label="هش نگاشت" value={preview.mapping_sha256} ltr />
                <KeyValue label="هش پیشنمایش" value={preview.preview_sha256} ltr />
                <KeyValue label="تأیید پیشین بیاعتبار" value={preview.approval.approval_invalidated ? "بله" : "خیر"} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="danger-soft" onClick={() => void checkGate()} disabled={busy}>
                  بررسی دروازهٔ اجرا
                </Button>
                <span className="self-center text-xs text-danger-ink">این دکمه فقط پاسخ مسدود واقعی سرور را بررسی میکند؛ اجرا انجام نمیشود.</span>
              </div>
              {gateMessage && <div className="mt-3"><Alert tone="warning">{gateMessage}</Alert></div>}
            </div>
          )}
        </CardBody>
      </Card>

      {preview && (
        <>
          <Card>
            <CardBody>
              <SectionTitle>۳. بازرسیmanifest و نتیجهٔ کامل فایلها</SectionTitle>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <KeyValue label="شناسهٔ عملیات" value={shortId(preview.operation_id)} ltr />
                  <KeyValue label="نسخهٔ بسته" value={preview.manifest.schema} ltr />
                  <KeyValue label="تعداد فایلها" value={preview.file_count.toLocaleString("fa-IR")} />
                  <KeyValue label="حجم فایلها" value={formatBytesFa(preview.total_bytes)} />
                  <KeyValue label="نسخهٔ پیشنمایش" value={preview.version.toLocaleString("fa-IR")} />
                  <KeyValue label="زمان ایجاد" value={formatDateTimeFa(preview.created_at)} />
                </div>
                <div>
                  <KeyValue label="هش manifest" value={preview.manifest_sha256} ltr />
                  <KeyValue label="هش بسته" value={preview.package_sha256} ltr />
                  <KeyValue label="هش نگاشت" value={preview.mapping_sha256} ltr />
                  <KeyValue label="هش پیشنمایش" value={preview.preview_sha256} ltr />
                  <KeyValue label="انواع موجودیت" value={preview.entity_types.map((type) => OWNER_LABELS_FA[type]).join("، ")} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StateBadge value="accepted" />
                <span className="text-xs self-center">{preview.counts.accepted.toLocaleString("fa-IR")}</span>
                <StateBadge value="rejected" />
                <span className="text-xs self-center">{preview.counts.rejected.toLocaleString("fa-IR")}</span>
                <StateBadge value="duplicate" />
                <span className="text-xs self-center">{preview.counts.duplicate.toLocaleString("fa-IR")}</span>
                <StateBadge value="unresolved" />
                <span className="text-xs self-center">{preview.counts.unresolved.toLocaleString("fa-IR")}</span>
              </div>
              <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">فایل</th>
                      <th className="px-3 py-2 text-start font-medium">نوع / حجم</th>
                      <th className="px-3 py-2 text-start font-medium">مالک هدف</th>
                      <th className="px-3 py-2 text-start font-medium">وضعیت</th>
                      <th className="px-3 py-2 text-start font-medium">دلیل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item) => (
                      <tr key={item.path} className="border-t border-line align-top">
                        <td className="px-3 py-2" dir="auto">{item.file_name}</td>
                        <td className="px-3 py-2"><span dir="ltr">{item.content_type}</span><br />{formatBytesFa(item.size_bytes)}</td>
                        <td className="px-3 py-2">{OWNER_LABELS_FA[item.owner_type]}<br /><span dir="ltr" className="font-mono text-[10px]">{shortId(item.owner_id)}</span></td>
                        <td className="px-3 py-2"><StateBadge value={item.status} /></td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{item.message_fa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionTitle>۴. حل تعارض با نگاشت صریح</SectionTitle>
              <p className="mt-1 text-xs leading-6 text-ink-muted">
                فقط فایلهای «حلنشده» میتوانند به رکورد ازپیشموجود و مجاز همان نوع و همان شرکت
                نگاشت شوند. نوع مالک، شرکت و محتوای بسته قابل تغییر نیست و فایلهای تکراری یا
                ردشده بازنویسی نمیشوند.
              </p>
              {unresolved.length === 0 ? (
                <div className="mt-3"><EmptyState compact title="مورد حلنشدهای وجود ندارد" description="نیازی به نگاشت تازه نیست." /></div>
              ) : mappingOwnersError ? (
                <div className="mt-3"><ErrorState compact message={mappingOwnersError} onRetry={() => void loadMappingOwners(preview)} /></div>
              ) : (
                <div className="mt-4 space-y-3">
                  {unresolved.map((item) => {
                    const options = mappingOwners.filter((owner) => owner.owner_type === item.owner_type);
                    return (
                      <div key={item.path} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                        <div className="text-[13px]" dir="auto">{item.file_name}</div>
                        <div>
                          <label htmlFor={`mapping-${item.path}`} className="text-xs text-ink-muted">رکورد مالک موجود</label>
                          <Select
                            id={`mapping-${item.path}`}
                            value={mappingSelections[item.path] ?? ""}
                            onChange={(event) => setMappingSelections((old) => ({ ...old, [item.path]: event.target.value }))}
                            className="mt-1"
                          >
                            <option value="">بدون تغییر ({shortId(item.owner_id)})</option>
                            {options.map((owner) => (
                              <option key={owner.owner_id} value={owner.owner_id}>{owner.reference} — {shortId(owner.owner_id)}</option>
                            ))}
                          </Select>
                        </div>
                        <StateBadge value={item.status} />
                      </div>
                    );
                  })}
                  <Button type="button" onClick={() => void applyMappings()} disabled={busy} loading={busy}>
                    اعمال نگاشت و پیشنمایش تازه
                  </Button>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void reloadPreview()} disabled={busy}>بازخوانی پیشنمایش</Button>
                <Button type="button" variant="danger-soft" onClick={() => void cancel()} disabled={busy}>لغو پیشنمایش</Button>
                <span className="self-center text-xs text-ink-subtle">لغو فقط وضعیت را بیاعتبار میکند؛ حذف فیزیکی انجام نمیشود.</span>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function HistoryCenter({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<TransferHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TransferOperationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getTransferHistory(100);
      setItems(result.items);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "دریافت تاریخچه ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const openDetail = async (operationId: string) => {
    setSelectedId(operationId);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      setDetail(await getTransferOperationDetail(operationId));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "دریافت جزئیات ناموفق بود.");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-5" role="tabpanel" aria-label="تاریخچه و ممیزی">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>عملیات صدور و ورود</SectionTitle>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>تازهمسازی</Button>
          </div>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            شناسهٔ عملیات، آغازکننده، تأییدکننده، نوع، فرادادهٔ بسته، انواع موجودیت، شمارشها،
            وضعیت، زمانها و جزئیات خطای امن از <span dir="ltr">audit_log</span> تراکنشی همان شرکت خوانده میشوند.
          </p>
          {loading ? (
            <div className="py-8"><Spinner label="در حال دریافت تاریخچه…" /></div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} compact />
          ) : items.length === 0 ? (
            <EmptyState compact title="عملیاتی ثبت نشده است" description="پس از نخستین پیشنمایش صدور یا ورود، سابقه اینجا نمایش داده میشود." />
          ) : (
            <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">عملیات</th>
                    <th className="px-3 py-2 text-start font-medium">نوع / وضعیت</th>
                    <th className="px-3 py-2 text-start font-medium">آغازکننده / تأییدکننده</th>
                    <th className="px-3 py-2 text-start font-medium">فایلها</th>
                    <th className="px-3 py-2 text-start font-medium">زمان</th>
                    <th className="px-3 py-2 text-start font-medium">جزئیات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.operation_id} className="border-t border-line hover:bg-surface-hover">
                      <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{shortId(item.operation_id)}</td>
                      <td className="px-3 py-2"><StateBadge value={item.operation_type} /> <StateBadge value={item.execution_status} /></td>
                      <td className="px-3 py-2 text-xs">{item.initiator_label}<br /><span className="text-ink-subtle">تأییدکننده: {item.approver_label}</span></td>
                      <td className="px-3 py-2 text-xs">
                        {item.file_count.toLocaleString("fa-IR")} فایل · {item.accepted_count.toLocaleString("fa-IR")} پذیرفته · {item.rejected_count.toLocaleString("fa-IR")} رد
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDateTimeFa(item.created_at)}<br /><span className="text-ink-subtle">پایان: {formatDateTimeFa(item.completed_at)}</span></td>
                      <td className="px-3 py-2">
                        <Button type="button" size="xs" variant="soft" onClick={() => void openDetail(item.operation_id)}>نمایش</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4"><StatusLegend /></div>
        </CardBody>
      </Card>

      {selectedId && (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>جزئیات عملیات {shortId(selectedId)}</SectionTitle>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedId(""); setDetail(null); }}>بستن</Button>
            </div>
            {detailLoading ? (
              <div className="py-6"><Spinner label="در حال دریافت رویدادها…" /></div>
            ) : detailError ? (
              <ErrorState compact message={detailError} onRetry={() => void openDetail(selectedId)} />
            ) : detail && (
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <KeyValue label="نوع عملیات" value={TRANSFER_STATUS_LABELS_FA[detail.operation_type] ?? detail.operation_type} />
                    <KeyValue label="وضعیت اجرا" value={<StateBadge value={detail.execution_status} />} />
                    <KeyValue label="آغازکننده" value={detail.initiator_label} />
                    <KeyValue label="تأییدکننده" value={detail.approver_label} />
                    <KeyValue label="حجم بسته" value={formatBytesFa(detail.total_bytes)} />
                    <KeyValue label="هش بسته" value={detail.package_sha256 ?? "—"} ltr />
                  </div>
                  <div>
                    <KeyValue label="شمارش پذیرفته / رد" value={`${detail.accepted_count.toLocaleString("fa-IR")} / ${detail.rejected_count.toLocaleString("fa-IR")}`} />
                    <KeyValue label="تکراری / حلنشده" value={`${detail.duplicate_count.toLocaleString("fa-IR")} / ${detail.unresolved_count.toLocaleString("fa-IR")}`} />
                    <KeyValue label="زمان ایجاد" value={formatDateTimeFa(detail.created_at)} />
                    <KeyValue label="زمان پایان" value={formatDateTimeFa(detail.completed_at)} />
                    <KeyValue label="خطای امن" value={detail.safe_failure ? `${detail.safe_failure.code}: ${detail.safe_failure.message_fa}` : "—"} />
                    <KeyValue label="نسخهٔ manifest" value={detail.manifest?.schema ?? "—"} ltr />
                  </div>
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-ink">رویدادهای ممیزی</div>
                  <ul className="mt-2 space-y-2">
                    {detail.events.map((event) => (
                      <li key={event.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                        <span><StateBadge value={event.phase} /> <StateBadge value={event.status} /></span>
                        <span className="text-ink-muted">{event.actor_label ?? "—"} · {formatDateTimeFa(event.at)}</span>
                        {event.safe_failure && <span className="text-danger-ink">{event.safe_failure.message_fa}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                {detail.manifest && (
                  <div>
                    <div className="text-[13px] font-semibold text-ink">فایلهایmanifest (بدون کلید استوریج و URL)</div>
                    <ul className="mt-2 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
                      {detail.manifest.files.map((file) => (
                        <li key={file.path} className="rounded-lg border border-line px-2 py-1" dir="auto">
                          {file.file_name} · {OWNER_LABELS_FA[file.owner_type]} · {formatBytesFa(file.size_bytes)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function AttachmentTransferCenter() {
  const auth = useAuth();
  const canUpload = auth.hasPermission("attachment.upload");
  const canViewProducts = auth.hasPermission("master.product.view");
  const [tab, setTab] = useState<TabId>("export");
  const [ownerTypes, setOwnerTypes] = useState<TransferOwnerTypeOption[]>([]);
  const [ownerTypesLoading, setOwnerTypesLoading] = useState(true);
  const [ownerTypesError, setOwnerTypesError] = useState("");
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const loadOwnerTypes = useCallback(async () => {
    setOwnerTypesLoading(true);
    setOwnerTypesError("");
    try {
      const result = await getTransferOwnerTypes();
      setOwnerTypes(result.items);
    } catch (err) {
      setOwnerTypes([]);
      setOwnerTypesError(err instanceof Error ? err.message : "دریافت انواع مجاز ناموفق بود.");
    } finally {
      setOwnerTypesLoading(false);
    }
  }, []);

  useEffect(() => { void loadOwnerTypes(); }, [loadOwnerTypes]);

  const onOperationCompleted = useCallback(() => {
    setHistoryRefreshToken((value) => value + 1);
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-ink">مرکز انتقال ضمائم چندموجودیتی</h1>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          صدور بستهٔ کنترلشده، بازرسی و پیشنمایش امن ورود، و تاریخچهٔ تراکنشی — فقط برای ضمائم
          هشت نوع مالک مصوب و فقط در شرکت نشست. هیچ کالا، دادهٔ مرجع، شرکت، دامنه یا مالک تازهای
          ساخته نمیشود.
        </p>
      </div>

      <TransferTabs tab={tab} onChange={setTab} />

      {tab === "export" && (
        <ExportCenter
          ownerTypes={ownerTypes}
          ownerTypesLoading={ownerTypesLoading}
          ownerTypesError={ownerTypesError}
          retryOwnerTypes={() => void loadOwnerTypes()}
          canViewProducts={canViewProducts}
          onOperationCompleted={onOperationCompleted}
        />
      )}
      {tab === "import" && (
        <ImportCenter canUpload={canUpload} canViewProducts={canViewProducts} onOperationCompleted={onOperationCompleted} />
      )}
      {tab === "history" && <HistoryCenter refreshToken={historyRefreshToken} />}

      <Card>
        <CardBody>
          <SectionTitle>مرزها و وابستگیها</SectionTitle>
          <ul className="mt-2 space-y-2 text-[13px] leading-6 text-ink-muted">
            <li>
              <b className="text-ink">صدور:</b> manifest فقط مرجع مالک و فرادادهٔ فایل دارد؛ هش SHA-256/CRC،
              مسیرهای سرورساخته، سقف حجم و امضای بایتی بررسی میشوند. دانلود با نشست همانمبدأ است و هیچ
              کلید استوریج، URL امضاشده، توکن یا اطلاعات زیرساخت در پاسخ/ممیزی نیست.
            </li>
            <li>
              <b className="text-ink">ورود:</b> اجرا نیازمند سیاست و اثرانگشت دونفرهٔ مصوب در
              <span dir="ltr"> rules-engine </span>
              است. <span dir="ltr">FINGERPRINT_FIELDS</span> برای <span dir="ltr">attachment.import.execute</span>
              تعریفنشده است؛ بنابراین اجرا fail-closed، خودتأییدی ممنوع، تغییر بسته/نگاشت بیاعتبارکنندهٔ تأیید،
              و پیشنمایش امن تحویل داده شده است.
            </li>
            <li>
              <b className="text-ink">رسید پرداخت / POD:</b> زنجیرهٔ مالکیت بکاند C3 حفظ شده است، ولی
              صفحهای کاربری که شناسهٔ <span dir="ltr">payment_receipt</span> یا <span dir="ltr">pod</span> را
              در معرض اپراتور قرار دهد وجود ندارد؛ بنابراین UI اختصاصیای اختراع نشده و وابستگی دقیق ثبت شده است.
            </li>
            <li>
              <b className="text-ink">رد صریح:</b> برند، دستهبندی، انبار، واحد اندازهگیری، <span dir="ltr">other</span>،
              انتساب بینشرکتی، ایجاد مالک مفقود، بازنویسی، حذف، بایگانی، جایگزینی خودکار، سیاست نگهداشت،
              مجوز/نقش/grant/مهاجرت/RLS تازه، G-13 و Q1–Q5 پشتیبانی نشدهاند.
            </li>
            <li>
              <b className="text-ink">حفظشده:</b> C1 تصاویر/اسناد کالا، B1/B2 جداسازی کاتالوگ مرکزی،
              C2 دادههای مرجع، C3 پنل مشترک ضمائم، RLS/FORCE RLS، <span dir="ltr">ownerTenantSql</span> و
              <span dir="ltr"> DomainBoundaryGuard</span> تغییر نکردهاند.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

export default AttachmentTransferCenter;
