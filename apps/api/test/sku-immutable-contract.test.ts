import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * REVIEW-01 / LOW-3 — قراردادِ قابل‌کشفِ code_immutable.
 * هیچ DBای لازم نیست؛ مشخصات و کلاینتِ تولیدشده را ایستا می‌سنجد.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require_ = createRequire(path.join(ROOT, 'apps', 'api', 'package.json'));
const YAML = require_('yaml') as { parse: (src: string) => any };

const spec = YAML.parse(
  readFileSync(path.join(ROOT, 'packages', 'contracts', 'openapi.yaml'), 'utf8'),
);
const clientSrc = readFileSync(
  path.join(ROOT, 'packages', 'api-client', 'src', 'schema.ts'),
  'utf8',
);

describe('C14 LOW-3 — قراردادِ code_immutable در OpenAPI', () => {
  it('پاسخِ reusable SkuImmutableError وجود دارد و envelope استانداردِ Error است', () => {
    const resp = spec.components?.responses?.SkuImmutableError;
    expect(resp, 'components.responses.SkuImmutableError must exist').toBeTruthy();
    expect(resp.content['application/json'].schema.$ref).toBe('#/components/schemas/Error');
    const example = resp.content['application/json'].examples?.code_immutable?.value;
    expect(example).toBeTruthy();
    expect(example.code).toBe('code_immutable');
    expect(example.details).toEqual({ field: 'code', surface: 'PATCH /products/:id' });
  });

  it('عملیات PATCH /products/{id} همین پاسخ را به‌عنوانِ 400 خود ارجاع می‌دهد', () => {
    const patch = spec.paths?.['/products/{id}']?.patch;
    expect(patch, 'PATCH /products/{id} must exist').toBeTruthy();
    expect(patch.responses['400'].$ref).toBe('#/components/responses/SkuImmutableError');
  });

  it('اسکیمای ProductUpdate کلیدِ code تعریف نمی‌کند (تغییرناپذیری در قرارداد)', () => {
    expect(spec.components?.schemas?.ProductUpdate?.properties ?? {}).not.toHaveProperty('code');
  });

  it('Error.code سند code_immutable را فهرست می‌کند (400)', () => {
    expect(spec.components?.schemas?.Error?.properties?.code?.description).toContain(
      'code_immutable',
    );
    expect(spec.components?.schemas?.Error?.properties?.code?.examples).toContain(
      'code_immutable',
    );
  });

  it('کلاینتِ تولیدشدهٔ TypeScript با قرارداد هم‌تراز است', () => {
    expect(clientSrc).toContain('SkuImmutableError');
    expect(clientSrc).toContain('code_immutable');
    // و ارجاعِ 400 عملیاتِ PATCH روی همان پاسخِ reusable است
    expect(clientSrc).toMatch(/400: components\["responses"\]\["SkuImmutableError"\]/);
  });
});
