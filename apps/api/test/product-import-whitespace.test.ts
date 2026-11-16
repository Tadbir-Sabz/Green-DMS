import { describe, expect, it } from 'vitest';
import { ProductMasterService } from '../src/modules/master-data/product-master.service';

/**
 * TASK-PM-02-C14-FINALIZATION-01 (§4 / F-07) — تستِ بدونِ DB روی کدِ واقعیِ
 * `validateImport` (همانی که commitImport نیز صدا می‌زند): سلولِ CSV با کدِ
 * دارای فاصلهٔ ابتدا/انتها باید خطای ردیفِ `invalid_code` بگیرد؛ هرگز بی‌صدا
 * trim و ذخیره نشود. وابستگی‌ها هرگز صدا زده نمی‌شوند (validateImport خالص است).
 *
 * این تست جایگزینِ تست‌های DB-backed نیست؛ فقط قراردادِ سطح سطرِ CSV را قفل می‌کند.
 */
const service = () =>
  new ProductMasterService(
    null as never, // CatalogAccess — صدا زده نمی‌شود
    null as never, // ProductMasterRepository — صدا زده نمی‌شود
    null as never, // AUDIT_SERVICE — صدا زده نمی‌شود
    null as never, // OrderCreationLock — صدا زده نمی‌شود
  );

const CSV_HEADER = 'code,name,category_code,base_uom_code';
const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\n');

describe('validateImport — قراردادِ فاصلهٔ مرزیِ کد (F-07)', () => {
  it('کد با فاصلهٔ ابتدایی → خطای ردیفِ invalid_code', () => {
    const out = service().validateImport('c1', csv([' ID-WS-1,کالای فاصله‌دار,PMCAT,pm_piece']));
    const hit = out.row_errors.find((e) => e.code === 'invalid_code');
    expect(hit).toBeTruthy();
    expect(hit!.row).toBe(2);
    expect(hit!.message_fa).toContain('فاصله');
    // ردیف خطادار نباید در rows ذخیره شود (fail-closed)
  });

  it('کد با فاصلهٔ انتهایی → خطای ردیفِ invalid_code', () => {
    const out = service().validateImport('c1', csv(['ID-WS-2 ,کالای فاصله‌دار,PMCAT,pm_piece']));
    const hit = out.row_errors.find((e) => e.code === 'invalid_code');
    expect(hit).toBeTruthy();
    expect(hit!.row).toBe(2);
  });

  it('کد با فاصلهٔ دو طرفه → خطای ردیفِ invalid_code', () => {
    const out = service().validateImport('c1', csv(['  ID-WS-3  ,کالای فاصله‌دار,PMCAT,pm_piece']));
    const hit = out.row_errors.find((e) => e.code === 'invalid_code');
    expect(hit).toBeTruthy();
  });

  it('CSV تمیز → بدونِ invalid_code', () => {
    const out = service().validateImport('c1', csv(['ID-WS-4,کالای تمیز,PMCAT,pm_piece']));
    expect(out.row_errors.filter((e) => e.code === 'invalid_code')).toEqual([]);
  });

  it('فاصلهٔ داخلی (نه مرزی) → invalid_code نمی‌دهد', () => {
    const out = service().validateImport('c1', csv(['ID WS-5,کالای داخل‌فاصله,PMCAT,pm_piece']));
    expect(out.row_errors.filter((e) => e.code === 'invalid_code')).toEqual([]);
  });
});
