import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setupProductMasterFixture,
  createProduct,
  type Fixture,
} from "./product-master-fixture";
import { CatalogAccess } from "../src/modules/master-data/catalog-access.service";
import { PG_POOL } from "../src/database/database.module";
import type { Pool } from "pg";
let fx: Fixture;
beforeAll(async () => {
  fx = await setupProductMasterFixture("greendms_pm_foundation");
});
afterAll(async () => {
  await fx?.teardown();
});

describe("PM integrated catalog foundation (native PostgreSQL required)", () => {
  it("creates a category through its public API, rejects duplicates, renames a stable family", async () => {
    const c = await fx
      .api()
      .post("/api/v1/product-categories")
      .send({ code: "PUBLIC-CAT", name: "گروه عمومی" })
      .expect(201);
    expect(c.body.id).toBeTruthy();
    await fx
      .api()
      .post("/api/v1/product-categories")
      .send({ code: "PUBLIC-CAT", name: "تکراری" })
      .expect(409);
    const f = await fx
      .api()
      .post("/api/v1/product-families")
      .send({ code: "PUBLIC-FAM", name: "خانواده اولیه" })
      .expect(201);
    const renamed = await fx
      .api()
      .patch(`/api/v1/product-families/${f.body.id}`)
      .send({ name: "خانواده جدید" })
      .expect(200);
    expect(renamed.body).toMatchObject({
      id: f.body.id,
      code: "PUBLIC-FAM",
      name: "خانواده جدید",
    });
  });
  it("records actor/before/after in stable cursor history and preserves soft-deleted history", async () => {
    const p = await createProduct(fx, { code: "HISTORY-1", name: "قبل" });
    await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ name: "بعد", row_version: p.row_version })
      .expect(200);
    const page = await fx
      .api()
      .get(`/api/v1/products/${p.id}/history?limit=1`)
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0]).toMatchObject({
      action: "UPDATE",
      before_data: { name: "قبل" },
      after_data: { name: "بعد" },
    });
    expect(page.body.items[0].actor_user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(page.body.has_more).toBe(true);
    const older = await fx
      .api()
      .get(`/api/v1/products/${p.id}/history?before=${page.body.next_cursor}`)
      .expect(200);
    expect(
      older.body.items.some((x: { action: string }) => x.action === "INSERT"),
    ).toBe(true);
    await fx.api().delete(`/api/v1/products/${p.id}`).expect(204);
    await fx.api().get(`/api/v1/products/${p.id}/history`).expect(200);
  });
  it("rolls product and trigger evidence back together on injected failure", async () => {
    const p = await createProduct(fx, {
      code: "ATOMIC-HISTORY",
      name: "محفوظ",
    });
    const access = fx.app.get(CatalogAccess);
    const pool = fx.app.get<Pool>(PG_POOL);
    const actor = await fx.pool.query(
      "select id from app_user where username='pm_admin'",
    );
    const before = await fx.pool.query(
      "select count(*)::int n from product_catalog_history where product_id=$1",
      [p.id],
    );
    await expect(
      access.write(
        fx.companyId,
        actor.rows[0].id,
        "master.product.update",
        async () => {
          await pool.query("update product set name=$2 where id=$1", [
            p.id,
            "نباید بماند",
          ]);
          throw new Error("injected after trigger");
        },
      ),
    ).rejects.toThrow("injected after trigger");
    const after = await fx.pool.query(
      "select count(*)::int n from product_catalog_history where product_id=$1",
      [p.id],
    );
    expect(after.rows).toEqual(before.rows);
    const saved = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(saved.body.name).toBe("محفوظ");
  });
  it("fails closed on unresolved domain catalog without inventing membership", async () => {
    const status = await fx
      .api()
      .get("/api/v1/product-domain-integration")
      .expect(200);
    expect(status.body).toMatchObject({
      available: false,
      code: "domain_identity_unresolved",
    });
    const p = await createProduct(fx, { code: "CENTRAL-NOT-DOMAIN" });
    await fx.api().get(`/api/v1/products/${p.id}/domain-catalog`).expect(503);
  });
  it("history grants are select-only for the application role, not editable evidence", async () => {
    const r = await fx.pool.query(
      "select has_table_privilege('dms_app','product_catalog_history','SELECT') s, has_table_privilege('dms_app','product_catalog_history','INSERT') i, has_table_privilege('dms_app','product_catalog_history','UPDATE') u, has_table_privilege('dms_app','product_catalog_history','DELETE') d",
    );
    expect(r.rows[0]).toEqual({ s: true, i: false, u: false, d: false });
  });
  it('rolls primary-barcode clearing and packaging insertion back on barcode conflict', async () => {
    const p = await createProduct(fx, { code: 'ROLLBACK-BC' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`).send({barcode:'PM-PRIMARY',kind:'internal',is_primary:true}).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`).send({barcode:'PM-PRIMARY',kind:'internal',is_primary:true}).expect(409);
    const barcodes = await fx.api().get(`/api/v1/products/${p.id}/barcodes`).expect(200);
    expect(barcodes.body).toHaveLength(1);
    expect(barcodes.body[0].is_primary).toBe(true);
    const q = await createProduct(fx, { code: 'ROLLBACK-PACK' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`).send({barcode:'PACK-CONFLICT',kind:'other'}).expect(201);
    await fx.api().post('/api/v1/packaging/product-packaging').send({product_id:q.id,uom_id:fx.uomBoxId,factor_to_base:2,barcode:'PACK-CONFLICT',confirm_sensitive:true}).expect(409);
    const saved = await fx.api().get(`/api/v1/packaging/product-packaging/${q.id}`).expect(200);
    expect(saved.body).toHaveLength(0);
  });
  it('rejects excess conversion precision and direct service writes with forged actor permissions', async () => {
    const p = await createProduct(fx, { code: 'PRECISION-PACK' });
    await fx.api().post('/api/v1/packaging/product-packaging').send({product_id:p.id,uom_id:fx.uomBoxId,factor_to_base:1.00001,confirm_sensitive:true}).expect(400);
    const { ProductService } = await import('../src/modules/master-data/product.service');
    const service = fx.app.get(ProductService);
    await expect(service.update(fx.companyId,p.id,{name:'forged'},{userId:'00000000-0000-4000-8000-000000000009',permissions:['*']},{ip:null,userAgent:null,requestId:null})).rejects.toMatchObject({status:403});
    const saved = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(saved.body.name).not.toBe('forged');
  });

  it('deactivates a family without deleting references or deactivating its products', async () => {
    const f = await fx.api().post('/api/v1/product-families').send({code:'LIFECYCLE',name:'خانواده پایدار'}).expect(201);
    const p = await createProduct(fx, {code:'FAMILY-OLD',family_id:f.body.id});
    await fx.api().patch(`/api/v1/product-families/${f.body.id}`).send({is_active:false}).expect(200);
    const product = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(product.body).toMatchObject({family_id:f.body.id,status:'active'});
    await fx.api().post('/api/v1/products').send({code:'FAMILY-NEW',name:'غیرمجاز',category_id:fx.categoryId,base_uom_id:fx.uomId,family_id:f.body.id}).expect(400);
    await fx.api().patch(`/api/v1/products/${p.id}`).send({name:'ویرایش عضو قبلی',family_id:f.body.id,row_version:product.body.row_version}).expect(200);
    await fx.api().patch(`/api/v1/product-families/${f.body.id}`).send({is_active:true}).expect(200);
  });

});
