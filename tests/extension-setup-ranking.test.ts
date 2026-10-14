import { it, expect } from 'bun:test';
import { rankSetupExtensions } from '../src/core/extensions/setup-ranking';
import type { StoreExtension } from '../src/core/extensions/store-api';
const item = (name: string, installs: number, banner?: string, extra: Partial<StoreExtension> = {}) => ({ name, installs, banner, downloads: 0, compatibility:'limited', ...extra } as StoreExtension);
it('recommends banner extensions first, then the most installed within each group', () => {
 const items = [item('Featured without banner',100000,undefined,{isFeatured:true}),item('Low-banner',5,'https://fixture.test/banner-low.jpg'),item('High-banner',500,'https://fixture.test/banner-high.jpg'),item('No-banner',200000),item('Empty-banner',100,'  '),item('External',900000,'https://fixture.test/external.jpg',{compatibility:'external'}),item('Unavailable',900000,'https://fixture.test/unavailable.jpg',{compatibility:'unavailable'})];
 const original = [...items];
 expect(rankSetupExtensions(items).map(item=>item.name)).toEqual(['High-banner','Low-banner','No-banner','Featured without banner','Empty-banner']);
 expect(items).toEqual(original);
});
it('ranks the complete catalog before taking setup recommendations and handles invalid counts', () => {
 const items=Array.from({length:10},(_,i)=>item('Earlier '+i,i));
 items.push(item('Banner beyond initial page',50,'https://fixture.test/banner.jpg'));
 items.push(item('Invalid counts',NaN,undefined,{downloads:NaN}));
 expect(rankSetupExtensions(items).slice(0,5).map(item=>item.name)).toEqual(['Banner beyond initial page','Earlier 9','Earlier 8','Earlier 7','Earlier 6']);
});
