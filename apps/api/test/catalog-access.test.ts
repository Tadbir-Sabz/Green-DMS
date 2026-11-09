import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { CatalogAccess } from '../src/modules/master-data/catalog-access.service';
import { TenantAwarePool } from '../src/database/tenant-pool';
import { tenantStorage } from '../src/database/tenant-context';
import { ProductMasterRepository } from '../src/modules/master-data/product-master.repository';

function fixture(permissions=['master.product.*']) {
 const log:string[]=[];
 const query=vi.fn(async(sql:string)=>{log.push(sql);return {rows:sql.includes('select distinct rp')?permissions.map(code=>({code})):[]};});
 const release=vi.fn();
 const client={query,release} as unknown as PoolClient;
 const inner={query,connect:vi.fn(async()=>client)} as unknown as Pool;
 const pool=new TenantAwarePool(inner) as unknown as Pool;
 return {pool,access:new CatalogAccess(pool),log,release,inner,query};
}
const company='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';

describe('canonical catalog service boundary (unit, no database substitute)',()=>{
 it('denies absent canonical permission before acquiring a transaction',async()=>{
   const f=fixture([]);const work=vi.fn();
   await expect(f.access.write(company,user,'master.product.update',work)).rejects.toMatchObject({status:403});
   expect(work).not.toHaveBeenCalled();expect(f.inner.connect).not.toHaveBeenCalled();
   expect(f.query.mock.calls[0][0]).toContain('p.company_id = $2');
   expect(f.query.mock.calls[0][0]).toContain('not u.is_locked');
 });
 it('sets transaction-local identity, joins nested work, and commits once',async()=>{
   const f=fixture();
   await f.access.write(company,user,'master.product.update',async()=>{
     expect(tenantStorage.getStore()?.tenant).toEqual({companyId:company,userId:user});
     await f.access.write(company,user,'master.product.update',async()=>{await f.pool.query('nested mutation');});
   });
   expect(f.inner.connect).toHaveBeenCalledTimes(1);
   expect(f.log.filter(s=>s==='begin')).toHaveLength(1);
   expect(f.log.filter(s=>s==='commit')).toHaveLength(1);
   expect(f.log.find(s=>s.includes('set_config'))).toContain('$2, true');
   expect(f.log.indexOf('nested mutation')).toBeLessThan(f.log.indexOf('commit'));
   expect(tenantStorage.getStore()).toBeUndefined();expect(f.release).toHaveBeenCalledOnce();
 });
 it('rolls back the outer transaction if nested mutation fails',async()=>{
   const f=fixture();
   await expect(f.access.write(company,user,'master.product.update',async()=>{
     await f.pool.query('first mutation');
     return f.access.write(company,user,'master.product.update',async()=>{throw new Error('injected');});
   })).rejects.toThrow('injected');
   expect(f.log).toContain('rollback');expect(f.log).not.toContain('commit');expect(f.release).toHaveBeenCalledOnce();
 });
 it('rejects tenant or actor substitution inside a transaction',async()=>{
   const f=fixture();
   await expect(f.access.write(company,user,'master.product.update',()=>f.access.write(user,company,'master.product.update',async()=>1))).rejects.toMatchObject({status:403});
   expect(f.log).toContain('rollback');
 });
 it('bundle replacement uses the same client and cannot independently commit',async()=>{
   const f=fixture();const repo=new ProductMasterRepository(f.pool);
   await expect(f.access.write(company,user,'master.product.update',async()=>{
     await repo.replaceBundle(company,[{componentProductId:user,qty:'1.0000'}]);
     throw new Error('after bundle failure');
   })).rejects.toThrow('after bundle failure');
   expect(f.inner.connect).toHaveBeenCalledOnce();expect(f.log).not.toContain('commit');expect(f.log).toContain('rollback');
 });
 it('rechecks canonical permissions inside the transaction after lock acquisition',async()=>{
   const f=fixture();let calls=0;
   f.query.mockImplementation(async(sql:string)=>{
     f.log.push(sql);
     return {rows:sql.includes('select distinct rp')&&++calls===1?[{code:'master.product.update'}]:[]};
   });
   const work=vi.fn();
   await expect(f.access.write(company,user,'master.product.update',work)).rejects.toMatchObject({status:403});
   expect(work).not.toHaveBeenCalled();expect(f.log).toContain('rollback');
 });
});
