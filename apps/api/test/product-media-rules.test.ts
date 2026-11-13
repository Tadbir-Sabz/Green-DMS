import { describe, expect, it } from 'vitest';
import { decodeUploadFileName } from '../src/modules/attachments/attachments.service';
import {
  PRODUCT_MEDIA_PRIMARY_LABEL_FA,
  PRODUCT_MEDIA_PRIMARY_RULE,
  findClientOwnerFields,
  mediaKind,
  mediaKindLabelFa,
  pickPrimaryImageId,
  toProductMediaItem,
  toProductMediaItems,
  type ProductMediaAttachment,
} from '../src/modules/master-data/product-media.rules';

/**
 * واحدِ خالصِ قواعد §B4 — بدون DB/MinIO. محاسبهٔ تصویرِ اصلی نباید وابسته به
 * ترتیبِ برگشتی pg باشد و نباید ستون is_primary/sort_order بسازد.
 */
const row = (
  id: string,
  createdAt: string,
  contentType = 'image/png',
): ProductMediaAttachment => ({
  id,
  owner_type: 'product',
  owner_id: '11111111-1111-4111-8111-111111111111',
  file_name: `${id}.png`,
  content_type: contentType,
  size_bytes: 33,
  sha256: 'a'.repeat(64),
  url: `https://storage.local/${id}`,
  created_at: createdAt,
});

describe('product media v1 primary-image rule (approved §B4)', () => {
  it('classifies only verified image types as images; PDF is a document', () => {
    expect(mediaKind('image/jpeg')).toBe('image');
    expect(mediaKind('image/png')).toBe('image');
    expect(mediaKind('image/webp')).toBe('image');
    expect(mediaKind('application/pdf')).toBe('document');
    expect(mediaKind('image/svg+xml')).toBe('document'); // نمیتواند تصویرِ اصلی شود
    expect(mediaKindLabelFa('image')).toBe('تصویر');
    expect(mediaKindLabelFa('document')).toBe('سند');
  });

  it('uses the oldest image by created_at, not the newest and not a PDF', () => {
    const rows = [
      row('newest', '2026-11-11T10:00:00.000Z'),
      row('pdf-first', '2026-11-11T08:00:00.000Z', 'application/pdf'),
      row('oldest-image', '2026-11-11T09:00:00.000Z'),
    ];
    expect(pickPrimaryImageId(rows)).toBe('oldest-image');

    const items = toProductMediaItems(rows);
    expect(items.map((i) => i.id)).toEqual(['pdf-first', 'oldest-image', 'newest']);
    expect(items.filter((i) => i.is_primary).map((i) => i.id)).toEqual(['oldest-image']);
    expect(items.find((i) => i.id === 'oldest-image')?.primary_label_fa).toBe(
      PRODUCT_MEDIA_PRIMARY_LABEL_FA,
    );
    expect(items.find((i) => i.id === 'pdf-first')?.primary_label_fa).toBeNull();
    expect(items.find((i) => i.id === 'pdf-first')?.kind).toBe('document');
  });

  it('breaks created_at ties deterministically by id', () => {
    const rows = [row('b', '2026-11-11T09:00:00.000Z'), row('a', '2026-11-11T09:00:00.000Z')];
    expect(pickPrimaryImageId(rows)).toBe('a');
    expect(toProductMediaItems(rows).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns no primary when there is no image at all', () => {
    const rows = [row('doc', '2026-11-11T09:00:00.000Z', 'application/pdf')];
    expect(pickPrimaryImageId(rows)).toBeNull();
    expect(toProductMediaItems(rows)[0].is_primary).toBe(false);
  });

  it('marks a freshly uploaded first image as primary using the same rule', () => {
    const fresh = row('fresh', '2026-11-11T12:00:00.000Z');
    expect(toProductMediaItem(fresh, 'fresh').is_primary).toBe(true);
    expect(toProductMediaItem(fresh, null).is_primary).toBe(false);
    expect(PRODUCT_MEDIA_PRIMARY_RULE).toBe('first_image_by_created_at');
  });
});

describe('product media client-supplied owner scope is rejected', () => {
  it('detects owner/tenant/storage fields case-insensitively without inspecting values', () => {
    expect(findClientOwnerFields({ owner_id: 'x', Company_ID: 'y', file: '[object File]' })).toEqual([
      'company_id',
      'owner_id',
    ]);
    expect(findClientOwnerFields({ OWNER_TYPE: 'product', storage_key: 'k', uploaded_by: 'u' })).toEqual([
      'owner_type',
      'storage_key',
      'uploaded_by',
    ]);
  });

  it('allows a body with no owner fields and tolerates absent/invalid bodies', () => {
    expect(findClientOwnerFields({})).toEqual([]);
    expect(findClientOwnerFields({ owner_id: undefined })).toEqual([]);
    expect(findClientOwnerFields(undefined)).toEqual([]);
    expect(findClientOwnerFields('not-an-object')).toEqual([]);
    expect(findClientOwnerFields([])).toEqual([]);
  });
});

describe('multipart filename decoding for Persian-first product media', () => {
  it('repairs a latin1-misread UTF-8 Persian filename from multer/busboy', () => {
    const mojibake = Buffer.from('نمای-اصلی.png', 'utf8').toString('latin1');
    expect(mojibake).not.toBe('نمای-اصلی.png');
    expect(decodeUploadFileName(mojibake)).toBe('نمای-اصلی.png');
  });

  it('leaves ASCII, already-correct Unicode and non-round-trippable names untouched', () => {
    expect(decodeUploadFileName('catalog.png')).toBe('catalog.png');
    expect(decodeUploadFileName('نمای-اصلی.png')).toBe('نمای-اصلی.png');
    expect(decodeUploadFileName('é.png')).toBe('é.png');
    expect(decodeUploadFileName('')).toBe('');
  });
});
