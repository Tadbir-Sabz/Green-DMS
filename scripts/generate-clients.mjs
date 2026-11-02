#!/usr/bin/env node
/**
 * تولید کلاینت‌ها از قرارداد مشترک packages/contracts/openapi.yaml
 *
 *   کلاینت TypeScript (وب):  openapi-typescript
 *                            → packages/api-client/src/schema.ts
 *   کلاینت Kotlin (اندروید):  openapi-generator-cli (kotlin + jvm-okhttp4 + coroutines)
 *                            → android/client/
 *
 * ابزارها:
 *   - openapi-typescript: از node_modules (devDependency پکیج api-client)
 *   - openapi-generator:  jar در tools/ (دانلود خودکار در صورت نبود)
 *   - جاوا: اولویت با tools/jre سپس java سیستم؛ در صورت نبود، JRE قابل حمل دانلود می‌شود
 *
 * اجرا: npm run clients:generate
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
const TOOLS = path.join(ROOT, 'tools');
const JAR = path.join(TOOLS, 'openapi-generator-cli.jar');
const JAR_URL =
  'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.26.0/openapi-generator-cli-7.26.0.jar';
const JRE_URL =
  'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk';
const LOCAL_JAVA = path.join(TOOLS, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

const TS_OUT = path.join(ROOT, 'packages', 'api-client', 'src', 'schema.ts');
const KT_OUT = path.join(ROOT, 'android', 'client');
const KT_ADDITIONAL = [
  'groupId=com.greendms',
  'artifactId=green-dms-api-client',
  'packageName=com.greendms.api.client',
  'useCoroutines=true',
  'hideGenerationTimestamp=true',
].join(',');

const log = (msg) => console.log(`\n▸ ${msg}`);

async function download(url, dest) {
  console.log(`  دانلود ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`دانلود ناموفق (${res.status}): ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`  ذخیره شد: ${path.relative(ROOT, dest)}`);
}

/** فراهم‌کردن jar openapi-generator */
async function ensureJar() {
  if (existsSync(JAR)) return;
  log('دانلود openapi-generator-cli');
  mkdirSync(TOOLS, { recursive: true });
  await download(JAR_URL, JAR);
}

/** فراهم‌کردن جاوا: tools/jre ← java سیستم ← دانلود JRE قابل حمل */
async function ensureJava() {
  if (existsSync(LOCAL_JAVA)) return LOCAL_JAVA;
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
    return 'java';
  } catch {
    /* نسخه سیستم نیست */
  }

  log('دانلود JRE قابل حمل (Temurin 21) در tools/jre');
  mkdirSync(TOOLS, { recursive: true });
  const zip = path.join(TOOLS, 'jre.zip');
  await download(JRE_URL, zip);
  const jreDir = path.join(TOOLS, 'jre');
  mkdirSync(jreDir, { recursive: true });
  try {
    // bsdtar (ویندوز/مک) zip را می‌فهمد؛ GNU tar نه
    const bsdtar =
      process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
    execFileSync(bsdtar, ['-xf', zip, '-C', jreDir, '--strip-components=1'], {
      stdio: 'inherit',
    });
  } finally {
    rmSync(zip, { force: true });
  }
  if (!existsSync(LOCAL_JAVA)) {
    throw new Error('استخراج JRE ناموفق بود؛ دستی tools/jre را آماده کنید.');
  }
  return LOCAL_JAVA;
}

async function generateTypeScript() {
  log('تولید کلاینت TypeScript → packages/api-client/src/schema.ts');
  const cli = path.join(ROOT, 'node_modules', 'openapi-typescript', 'bin', 'cli.js');
  if (!existsSync(cli)) {
    throw new Error('openapi-typescript نصب نیست؛ ابتدا npm install را اجرا کنید.');
  }
  execFileSync(process.execPath, [cli, SPEC, '-o', TS_OUT], { stdio: 'inherit' });
}

async function generateKotlin() {
  log('تولید کلاینت Kotlin → android/client');
  await ensureJar();
  const java = await ensureJava();
  execFileSync(
    java,
    [
      '-jar',
      JAR,
      'generate',
      '-i',
      SPEC,
      '-g',
      'kotlin',
      '--library',
      'jvm-okhttp4',
      '-o',
      KT_OUT,
      '--additional-properties',
      KT_ADDITIONAL,
    ],
    { stdio: 'inherit' },
  );
}

try {
  if (!existsSync(SPEC)) throw new Error(`قرارداد یافت نشد: ${SPEC}`);
  await generateTypeScript();
  await generateKotlin();
  console.log('\n✓ هر دو کلاینت تولید شدند.');
  console.log('  TypeScript: packages/api-client  (npm run typecheck -w packages/api-client)');
  console.log('  Kotlin:     android/client       (راهنما: android/README.md)');
} catch (err) {
  console.error(`\n✗ شکست تولید کلاینت‌ها: ${err.message}`);
  process.exit(1);
}
