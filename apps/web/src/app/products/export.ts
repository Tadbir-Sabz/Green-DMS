/** Server-provided export metadata; null means the header was absent/invalid. */
export interface ProductExportMeta {
  rowCount: number | null;
  truncated: boolean;
  maxRows: number | null;
}

/** Parse Content-Disposition without trusting a server-supplied path or newline. */
export function productExportFilename(
  disposition: string | null | undefined,
  fallback = 'products.csv',
): string {
  const header = (disposition ?? '').trim();
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  const bare = /filename\s*=\s*([^";]+)/i.exec(header);
  // Accept both a Content-Disposition header and an already-extracted filename.
  const headerLike = /filename\s*=|;|=/.test(header);
  const raw = (quoted?.[1] ?? bare?.[1] ?? (headerLike ? fallback : header || fallback)).trim();
  const basename = raw.split(/[\\/]/).pop() ?? fallback;
  const safe = basename.replace(/[\r\n"']/g, '').trim();
  return safe ? (safe.toLowerCase().endsWith('.csv') ? safe : `${safe}.csv`) : fallback;
}

export function readProductExportMeta(response: Pick<Response, 'headers'>): ProductExportMeta {
  const int = (name: string): number | null => {
    const raw = response.headers.get(name);
    if (raw == null || !/^\d+$/.test(raw.trim())) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isSafeInteger(value) ? value : null;
  };
  return {
    rowCount: int('X-Product-Export-Row-Count'),
    truncated: (response.headers.get('X-Product-Export-Truncated') ?? '').trim() === 'true',
    maxRows: int('X-Product-Export-Max-Rows'),
  };
}

/** Persian operator feedback; truncation must never look like a complete export. */
export function productExportNotice(meta: ProductExportMeta): string {
  const count = meta.rowCount == null ? 'تعداد نامشخص' : `${meta.rowCount.toLocaleString('fa-IR')} کالا`;
  if (meta.truncated) {
    const ceiling = meta.maxRows == null ? 'سقف مجاز' : `${meta.maxRows.toLocaleString('fa-IR')} ردیف`;
    return `خروجی ناقص است: ${count} تا سقف ${ceiling} دریافت شد. فیلتر را محدودتر کنید تا همهٔ کالاها صادر شوند.`;
  }
  return `خروجی کامل شامل ${count} آماده شد.`;
}

/** Trigger a browser download from a CSV string; returns the filename used. */
export function downloadProductExportCsv(csv: string, filename: string): string {
  const name = productExportFilename(filename);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revocation so Safari/Chrome can begin the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}
