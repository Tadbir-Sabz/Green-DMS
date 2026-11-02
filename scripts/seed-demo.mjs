#!/usr/bin/env node
/**
 * اجرای داده نمایشی روی دیتابیس جاری (.env → DATABASE_URL)
 *
 * - اگر شرکت PARS قبلاً ثبت شده باشد، بی‌صدا رد می‌شود (تکرارپذیر).
 * - پس از ثبت شرکت، مهاجرت 0022 دوباره اجرا می‌شود تا نقش‌ها و سمت‌های
 *   شرکت نمونه هم ساخته شوند (همان seed اولیه — امن و بدون بازنویسی).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('خطا: DATABASE_URL در .env تنظیم نیست.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

try {
  const { rows } = await pool.query(
    "select id from company where code = 'PARS' limit 1",
  );
  if (rows.length > 0) {
    console.log('داده نمایشی (شرکت PARS) قبلاً ثبت شده است؛ کاری انجام نشد.');
    process.exit(0);
  }

  const seedSql = await readFile(path.join(ROOT, 'scripts', 'seed-demo.sql'), 'utf8');
  const rolesSql = await readFile(
    path.join(ROOT, 'migrations', '0022_seed_reference_data.up.sql'),
    'utf8',
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query(rolesSql); // نقش‌ها/سمت‌ها برای شرکت تازه
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows: counts } = await pool.query(`
    select (select count(*) from company)        as companies,
           (select count(*) from branch)         as branches,
           (select count(*) from sales_area)     as areas,
           (select count(*) from route)          as routes,
           (select count(*) from warehouse)      as warehouses,
           (select count(*) from product)        as products,
           (select count(*) from customer)       as customers,
           (select count(*) from job_position)   as job_positions,
           (select count(*) from role)           as roles`);

  console.log('✓ داده نمایشی ثبت شد:');
  console.log(
    `  شرکت ${counts[0].companies} | شعبه ${counts[0].branches} | حوزه ${counts[0].areas} | مسیر ${counts[0].routes}`,
  );
  console.log(
    `  انبار ${counts[0].warehouses} | کالا ${counts[0].products} | مشتری ${counts[0].customers} | سمت ${counts[0].job_positions} | نقش ${counts[0].roles}`,
  );
} catch (err) {
  console.error(`خطا: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
