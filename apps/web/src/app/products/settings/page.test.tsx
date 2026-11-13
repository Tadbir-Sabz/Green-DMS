import React from 'react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import CatalogSettings from './page';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),canWrite:false}));
vi.mock('@/lib/api',()=>({api:{GET:mocks.get,POST:mocks.post,PATCH:mocks.patch}}));
vi.mock('@/lib/auth',()=>({useAuth:()=>({hasPermission:()=>mocks.canWrite})}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.canWrite=false;mocks.get.mockImplementation(async(path:string)=>path==='/product-families'?{data:[{id:'f1',code:'F1',name:'خانواده تست',is_active:true}]}:{data:{items:[]}});});
describe('catalog settings permissions and connected lifecycle',()=>{
 it('readers can browse but cannot see write controls',async()=>{
   render(<CatalogSettings/>);await screen.findByText('خانواده تست');
   expect(screen.queryByRole('button',{name:'ذخیره'})).toBeNull();
   expect(screen.queryByRole('button',{name:'غیرفعال‌سازی'})).toBeNull();
 });
 it('deactivates through the real API contract rather than local-only state',async()=>{
   mocks.canWrite=true;mocks.patch.mockResolvedValue({data:{id:'f1',is_active:false}});
   render(<CatalogSettings/>);
   fireEvent.click(await screen.findByRole('button',{name:'غیرفعال‌سازی'}));
   await waitFor(()=>expect(mocks.patch).toHaveBeenCalledWith('/product-families/{id}',{params:{path:{id:'f1'}},body:{is_active:false}}));
   await screen.findByText('وضعیت خانواده ذخیره شد. وضعیت کالاهای قبلی تغییر نکرد.');
 });
});
