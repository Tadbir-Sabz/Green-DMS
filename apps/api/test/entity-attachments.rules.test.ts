import { describe, expect, it } from 'vitest';
import {
  ENTITY_ATTACHMENT_LABELS_FA,
  ENTITY_ATTACHMENT_MODULE_PATHS,
  ENTITY_ATTACHMENT_NOTE_FA,
  ENTITY_ATTACHMENT_OWNER_TYPES,
  buildEntityAttachmentView,
  entityAttachmentKind,
  entityAttachmentKindLabelFa,
  findEntityOwnerFields,
  findUnsupportedBodyFields,
  isEntityAttachmentOwnerType,
  toEntityAttachmentItem,
  type EntityAttachmentItem,
} from '../src/modules/attachments/entity-attachments.rules';
import {
  KNOWN_OWNER_TYPES,
  VERIFIABLE_OWNER_TYPES,
  hasVerifiableOwner,
  ownerTenantSql,
} from '../src/modules/attachments/owner-scope';
import { ATTACHMENT_OWNER_TYPES } from '../src/modules/attachments/attachments.dto';

/**
 * TASK-PM-02-C3 — قواعد خالص، بدون DB/MinIO. هدف اصلی: اثبات اینکه C3 هیچ
 * «نوع مالک» تازهای نساخته و دقیقاً روی enum مصوب + زنجیرهٔ مالکیت موجود
 * سوار است.
 */

const row = (over: Partial<EntityAttachmentItem> = {}): Omit<EntityAttachmentItem, 'kind' | 'kind_label_fa'> => ({
  id: '11111111-1111-4111-8111-111111111111',
  owner_type: 'invoice',
  owner_id: '22222222-2222-4222-8222-222222222222',
  file_name: 'فاکتور.png',
  content_type: 'image/png',
  size_bytes: 33,
  sha256: 'a'.repeat(64),
  url: 'https://storage.local/signed?key=x',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('TASK-PM-02-C3 entity attachment rules — approved owner types only', () => {
  it('supports exactly the seven existing, verified operational owner types', () => {
    expect([...ENTITY_ATTACHMENT_OWNER_TYPES].sort()).toEqual(
      ['invoice', 'journal_entry', 'pod', 'receipt', 'return_request', 'sales_order', 'stock_count'].sort(),
    );
    for (const type of ENTITY_ATTACHMENT_OWNER_TYPES) {
      expect(ATTACHMENT_OWNER_TYPES as readonly string[], `${type} missing from the approved DTO enum`).toContain(type);
      expect(KNOWN_OWNER_TYPES, `${type} missing from owner-scope`).toContain(type);
      expect(VERIFIABLE_OWNER_TYPES, `${type} has no verified tenant chain`).toContain(type);
      expect(hasVerifiableOwner(type)).toBe(true);
      expect(ownerTenantSql(type)).toMatch(/company_id/);
      expect(ENTITY_ATTACHMENT_LABELS_FA[type]).toBeTruthy();
      expect(ENTITY_ATTACHMENT_MODULE_PATHS[type]).toMatch(/^\//);
    }
  });

  it('does not invent new owner types and keeps product / other / master-data out', () => {
    for (const type of ['product', 'other', 'brand', 'product_category', 'warehouse', 'uom', 'domain', 'invoice ']) {
      expect(isEntityAttachmentOwnerType(type), `${type} must not be a C3 owner`).toBe(false);
    }
    // `other` عمداً راستیآزماییناپذیر است؛ product متعلق به نمای C1 است.
    expect(hasVerifiableOwner('other')).toBe(false);
    expect(ownerTenantSql('other')).toBeNull();
    expect(hasVerifiableOwner('product')).toBe(true);
  });

  it('rejects client-supplied ownership fields explicitly (case-insensitive, sorted)', () => {
    expect(findEntityOwnerFields({ file: 'x', owner_id: 'a', OWNER_TYPE: 'b', Company_Id: 'c' })).toEqual([
      'company_id',
      'owner_id',
      'owner_type',
    ]);
    expect(findEntityOwnerFields({ domain_status: 'active' })).toEqual(['domain_status']);
    expect(findEntityOwnerFields({ file: 'x' })).toEqual([]);
    expect(findEntityOwnerFields(null)).toEqual([]);
    expect(findEntityOwnerFields(['x'])).toEqual([]);
  });

  it('rejects extra multipart fields but never double-reports owner fields', () => {
    expect(findUnsupportedBodyFields({ file: 'x', note: 'y', z: 'w' })).toEqual(['note', 'z']);
    expect(findUnsupportedBodyFields({ file: 'x', owner_id: 'a' })).toEqual([]);
    expect(findUnsupportedBodyFields({})).toEqual([]);
    expect(findUnsupportedBodyFields(undefined)).toEqual([]);
  });

  it('classifies image vs document purely from verified content type', () => {
    expect(entityAttachmentKind('image/png')).toBe('image');
    expect(entityAttachmentKind('IMAGE/JPEG')).toBe('image');
    expect(entityAttachmentKind('image/webp')).toBe('image');
    expect(entityAttachmentKind('application/pdf')).toBe('document');
    expect(entityAttachmentKindLabelFa('image')).toBe('تصویر');
    expect(entityAttachmentKindLabelFa('document')).toBe('سند');
    expect(toEntityAttachmentItem(row()).kind_label_fa).toBe('تصویر');
  });

  it('builds one shared view shape with counts, labels and no domain fields', () => {
    const view = buildEntityAttachmentView('return_request', '22222222-2222-4222-8222-222222222222', [
      row({ id: 'a', content_type: 'image/png' }),
      row({ id: 'b', content_type: 'application/pdf', file_name: 'گزارش.pdf' }),
      row({ id: 'c', content_type: 'image/jpeg' }),
    ]);
    expect(view.owner_type).toBe('return_request');
    expect(view.owner_label_fa).toBe('درخواست مرجوعی');
    expect(view.module_path).toBe('/returns');
    expect(view.counts).toEqual({ images: 2, documents: 1, total: 3 });
    expect(view.items.map((i) => i.kind_label_fa)).toEqual(['تصویر', 'سند', 'تصویر']);
    expect(view.note_fa).toBe(ENTITY_ATTACHMENT_NOTE_FA);
    expect(view).not.toHaveProperty('domain_id');
    expect(view).not.toHaveProperty('available');
    expect(view).not.toHaveProperty('domain_status');
    expect(view.items.every((i) => !('is_primary' in i) && !('sort_order' in i))).toBe(true);
  });
});
