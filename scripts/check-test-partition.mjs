#!/usr/bin/env node
/**
 * Partitions apps/api tests into DB-free (unit) and DB-backed sets, and guards the
 * partition against silent drift. TASK-23R (F-02).
 *
 * Background: the CI `unit` job historically selected `test/*.test.ts` minus
 * `*.api.test.ts`, assuming the suffix was the DB boundary. DB-backed tests with a
 * plain `.test.ts` suffix (the TASK-23 security suites, the Product Master family)
 * silently joined that selection and failed at module load with
 * `TypeError: Invalid URL` when `DATABASE_URL` was unset.
 *
 * Partition rule (computed from code, cross-checked against an actual no-DB run):
 *   - `*.api.test.ts`      → DB-backed by suffix convention (boots the app).
 *   - any other `test/*.test.ts` that reads `process.env.DATABASE_URL` — directly or
 *     through a transitive import inside `apps/api/test/` (fixtures/helpers) — is
 *     DB-backed. Empirically these are exactly the files that cannot run without a
 *     live PostgreSQL (they fail at module load or in beforeAll).
 *   - everything else      → unit: must run green with no DB/MinIO env.
 *
 * As a backstop, `--check` fails if a unit-classified file contains live database
 * operations (`connectionString`, `execFileSync`, `new pg.Pool`, `spawnSync`) —
 * i.e. a future test that reaches PostgreSQL through a channel other than
 * `process.env.DATABASE_URL` must be declared in the manifest explicitly.
 *
 * The manifest `apps/api/test/db-backed-tests.txt` is the *declared* partition used
 * by CI job selections. `--check` verifies declared == computed, so a new DB-backed
 * test cannot silently re-enter the no-DB job: the static CI job fails here first,
 * with an actionable message.
 *
 * Usage:
 *   node scripts/check-test-partition.mjs              # verify + print matrix (alias: --check)
 *   node scripts/check-test-partition.mjs --print unit # DB-free test files (relative to apps/api)
 *   node scripts/check-test-partition.mjs --print db   # non-api DB-backed test files (relative to apps/api)
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(ROOT, 'apps', 'api', 'test');
const MANIFEST = path.join(TEST_DIR, 'db-backed-tests.txt');

/** The single, precise "needs a live PostgreSQL" signal: reading the connection URL. */
const DB_URL_READERS = [
  'process.env.DATABASE_URL',
  "process.env['DATABASE_URL']",
  'process.env["DATABASE_URL"]',
];

/** Live-DB operations that must never appear in a unit-classified file. */
const LIVE_DB_OPS = ['connectionString', 'execFileSync', 'new pg.Pool', 'spawnSync'];

function readIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, 'index.ts')];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function localImports(source) {
  const specs = new Set();
  const re = /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\(|export\s+[^'"]*?\s+from\s+|require\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) specs.add(m[1]);
  return [...specs];
}

/** Transitive closure of a test file over relative imports inside apps/api/test/. */
function testLocalClosure(entryFile) {
  const seen = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readIfExists(file);
    if (source === null) continue;
    for (const spec of localImports(source)) {
      const resolved = resolveLocal(file, spec);
      if (resolved && resolved.startsWith(TEST_DIR + path.sep)) queue.push(resolved);
    }
  }
  return seen;
}

function readsDbUrl(entryFile) {
  for (const file of testLocalClosure(entryFile)) {
    const source = readIfExists(file);
    if (source !== null && DB_URL_READERS.some((k) => source.includes(k))) return true;
  }
  return false;
}

function classify() {
  const all = readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.ts'))
    .sort();
  const api = [];
  const dbNonApi = [];
  const unit = [];
  for (const f of all) {
    if (f.endsWith('.api.test.ts')) {
      api.push(f);
    } else if (readsDbUrl(path.join(TEST_DIR, f))) {
      dbNonApi.push(f);
    } else {
      unit.push(f);
    }
  }
  return { all, api, dbNonApi, unit };
}

function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  return readFileSync(MANIFEST, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0)
    .sort();
}

function check() {
  const { all, api, dbNonApi, unit } = classify();
  const declared = readManifest();
  const errors = [];

  if (declared === null) {
    errors.push(`manifest missing: ${path.relative(ROOT, MANIFEST)}`);
  } else {
    for (const f of declared) {
      if (!all.includes(f)) errors.push(`manifest lists a missing file: ${f}`);
      if (f.endsWith('.api.test.ts')) {
        errors.push(`manifest must list only non-api test files (suffix already implies DB): ${f}`);
      }
    }
    const declaredSet = new Set(declared);
    for (const f of dbNonApi) {
      if (!declaredSet.has(f)) {
        errors.push(
          `DB-backed test NOT declared in the manifest: ${f}\n` +
            `    → it would silently join the no-DB unit job and fail without DATABASE_URL.\n` +
            `    → add it to apps/api/test/db-backed-tests.txt (it then runs in the integration-db job).`,
        );
      }
    }
    for (const f of declared) {
      if (!dbNonApi.includes(f)) {
        errors.push(
          `manifest declares a file that does not read process.env.DATABASE_URL: ${f}\n` +
            `    → remove it from the manifest (it must stay in the no-DB unit job), or\n` +
            `    → if it really needs PostgreSQL, make that dependency explicit (read DATABASE_URL).`,
        );
      }
    }
  }

  // Backstop: a unit-classified file must not reach PostgreSQL through any other channel.
  for (const f of unit) {
    const source = readIfExists(path.join(TEST_DIR, f)) ?? '';
    const hits = LIVE_DB_OPS.filter((op) => source.includes(op));
    if (hits.length > 0) {
      errors.push(
        `unit-classified test performs live DB operations without reading DATABASE_URL: ${f} (${hits.join(', ')})\n` +
          `    → if it truly needs PostgreSQL, declare it in apps/api/test/db-backed-tests.txt and read DATABASE_URL;\n` +
          `    → if it is mock-based, keep the mocks and this file stays in the unit job.`,
      );
    }
  }

  console.log('=== apps/api test partition ===');
  console.log(`api (*.api.test.ts, DB-backed by convention): ${api.length}`);
  console.log(`non-api DB-backed: ${dbNonApi.length}`);
  for (const f of dbNonApi) console.log(`    db   ${f}`);
  console.log(`non-api DB-free (unit): ${unit.length}`);
  for (const f of unit) console.log(`    unit ${f}`);
  console.log(`total test files: ${all.length}`);

  if (errors.length > 0) {
    console.error('\nTEST PARTITION DRIFT DETECTED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\npartition OK: declared manifest == computed partition');
}

function printSet(which) {
  const { api, dbNonApi, unit } = classify();
  if (which === 'unit') {
    console.log(unit.map((f) => `test/${f}`).join(' '));
  } else if (which === 'db') {
    // The CI DB job selects *.api.test.ts itself; this prints the non-api DB files
    // to append, so every DB-backed test runs in exactly one DB-backed job.
    console.log(dbNonApi.map((f) => `test/${f}`).join(' '));
  } else if (which === 'db-all') {
    console.log([...api, ...dbNonApi].map((f) => `test/${f}`).join(' '));
  } else {
    console.error(`unknown set: ${which}`);
    process.exit(2);
  }
}

const arg = process.argv[2] ?? '--check';
if (arg === '--print') {
  printSet(process.argv[3] ?? '');
} else if (arg === '--check' || arg === '') {
  check();
} else {
  console.error(`unknown argument: ${arg}`);
  process.exit(2);
}
