import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {createHostApp}=require('../desktop/runtime/extension-api-host/host-server.cjs');
const manifest=JSON.parse(readFileSync('toko/,/manifest.json','utf8'));
const entry={manifest,bundlePath:resolve('toko/,/dist/bundle.js')};
const host=createHostApp({registry:{listLoaded:()=>[manifest.id],lookup:()=>entry}});
const server=createServer(host.handler);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api/v3/toko`;
const cases=process.argv.slice(2).length?process.argv.slice(2):['Three Days of Happiness','Spice and Wolf','Overgeared','Ascendance of a Bookworm: Part 5'];
try{
 for(const title of cases){
  const url=`${base}/novel/chapters?title=${encodeURIComponent(title)}&refresh=1`;
  const start=performance.now(),first=await(await fetch(url)).json(),firstMs=Math.round(performance.now()-start);
  const warmStart=performance.now(),warm=await(await fetch(url)).json(),warmMs=Math.round(performance.now()-warmStart);
  let textCount=0;
  if(first.chapters?.[0]){const row=first.chapters[0];const text=await(await fetch(`${base}/novel/content?chapterKey=${encodeURIComponent(row.chapterKey)}&provider=${encodeURIComponent(row.provider)}`)).json();textCount=text.paragraphs?.length||0;}
  process.stdout.write(JSON.stringify({title,firstMs,warmMs,chapters:first.count,firstProvider:first.chapters?.[0]?.provider,language:first.chapters?.[0]?.language,paragraphs:textCount,pending:first.partial})+'\n');
 }
}finally{await new Promise(resolve=>server.close(resolve));host.invalidateBundles();}
