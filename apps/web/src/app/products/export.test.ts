import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadProductExportCsv,
  productExportFilename,
  productExportNotice,
  readProductExportMeta,
} from './export';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe('product CSV export browser helper', () => {
  it('uses only the basename from Content-Disposition and forces a .csv suffix', () => {
    expect(productExportFilename('attachment; filename="products-20261107.csv"')).toBe('products-20261107.csv');
    expect(productExportFilename('attachment; filename=../../etc/passwd')).toBe('passwd.csv');
    expect(productExportFilename('attachment; filename="bad\r\nname"')).toBe('badname.csv');
    expect(productExportFilename(null)).toBe('products.csv');
  });

  it('reads bounded metadata and treats truncation as unsafe', () => {
    const response = new Response('', {
      headers: new Headers({
        'X-Product-Export-Row-Count': '2',
        'X-Product-Export-Truncated': 'true',
        'X-Product-Export-Max-Rows': '1',
      }),
    });
    const meta = readProductExportMeta(response);
    expect(meta).toEqual({ rowCount: 2, truncated: true, maxRows: 1 });
    expect(productExportNotice(meta)).toContain('ناقص');
    expect(productExportNotice({ rowCount: 2, truncated: false, maxRows: 10000 })).toContain('کامل');
  });

  it('creates a UTF-8 CSV blob, clicks a download anchor and revokes the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:product-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    let clickedDownload = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownload = this.download;
    });
    vi.useFakeTimers();

    const name = downloadProductExportCsv('\uFEFF"code"\r\n"P-001"\r\n', 'products-20261107.csv');
    expect(name).toBe('products-20261107.csv');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickedDownload).toBe('products-20261107.csv');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:product-export');
  });
});
