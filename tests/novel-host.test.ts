import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
const { createHostApp } = require('../desktop/runtime/extension-api-host/host-server.cjs');
test('a registry-loaded namespace without legacy sideloaded metadata serves novels', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'novel-host-test-'));
  const bundlePath = join(dir, 'bundle.cjs');
  writeFileSync(bundlePath, `module.exports={ getNovelChapters:async()=>[{number:1,title:'First',sources:[{provider:'fixture',chapterKey:'fixture:1'}]}], getNovelContent:async()=>({paragraphs:[{index:0,text:'Chapter text.'}],title:'First'}) };`);
  const entry = { bundlePath, manifest: { id: 'fixture', apiServer: { namespace: 'fixture', routes: ['novel/chapters','novel/content'] }, capabilities: ['novel'] } };
  const host = createHostApp({ registry: { listLoaded: () => ['fixture'], lookup: () => entry } });
  const server = createServer(host.handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v3`;
  try {
    const health = await (await fetch(`${base}/health`)).json(); expect(health.namespaces[0].namespace).toBe('fixture');
    const chapters = await fetch(`${base}/fixture/novel/chapters?title=Fixture`); expect(chapters.status).toBe(200); expect((await chapters.json()).count).toBe(1);
    const text = await fetch(`${base}/fixture/novel/content?chapterKey=fixture%3A1`); expect(text.status).toBe(200); expect((await text.json()).paragraphs[0].text).toBe('Chapter text.');
    expect((await fetch(`${base}/missing/novel/chapters?title=X`)).status).toBe(404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('early novel responses are not cached before later providers have finished', async () => {
 const dir=mkdtempSync(join(tmpdir(),'novel-progress-'));const bundlePath=join(dir,'bundle.cjs');
 writeFileSync(bundlePath,`let calls=0;module.exports={getNovelChapters:async()=>[],debugNovelChapters:async params=>{calls++;return{complete:params.fullScan||calls>1,results:Array.from({length:params.fullScan?3:calls>1?2:1},(_,i)=>({number:i+1,sources:[{provider:'fixture',chapterKey:'fixture:'+i}]})),diagnostics:[]}}};`);
 const entry={bundlePath,manifest:{id:'progress',apiServer:{namespace:'progress',routes:['novel/chapters']},capabilities:['novel']}};
 const host=createHostApp({registry:{listLoaded:()=>['progress'],lookup:()=>entry}});
 const server=createServer(host.handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${(server.address() as any).port}/api/v3/progress/novel/chapters?title=Fixture`;
 try{
  const early=await(await fetch(url)).json();expect(early.count).toBe(1);expect(early.partial).toBe(true);
  const later=await(await fetch(url)).json();expect(later.count).toBe(2);expect(later.partial).toBe(false);
  const cached=await(await fetch(url)).json();expect(cached.count).toBe(2);expect(cached.cached).toBe(true);
  expect((await(await fetch(url+'&fullScan=1')).json()).count).toBe(3);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('replacing an installed bundle reloads its code and clears chapter results', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'novel-reload-'));
 const bundlePath = join(dir, 'bundle.cjs');
 const write = (title: string) => writeFileSync(bundlePath, `module.exports={getNovelChapters:async()=>[{number:1,title:${JSON.stringify(title)},sources:[{provider:'fixture',chapterKey:'fixture:1'}]}]};`);
 write('Old chapter');
 const entry = { bundlePath, manifest: {id:'reload',apiServer:{namespace:'reload',routes:['novel/chapters']},capabilities:['novel']} };
 const host = createHostApp({registry:{listLoaded:()=>['reload'],lookup:()=>entry}});
 const server = createServer(host.handler); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url = `http://127.0.0.1:${(server.address() as any).port}/api/v3/reload/novel/chapters?title=Reload`;
 try {
  expect((await (await fetch(url)).json()).chapters[0].title).toBe('Old chapter');
  write('New chapter after installation');
  expect((await (await fetch(url)).json()).chapters[0].title).toBe('New chapter after installation');
 } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
