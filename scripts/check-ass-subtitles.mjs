import { chromium } from 'playwright';
import { build } from 'esbuild';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildAssRenderer } from './build-ass-renderer.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'artifacts/ass-subtitles');await mkdir(output,{recursive:true});
await buildAssRenderer();
await build({entryPoints:[path.join(root,'tests/fixtures/ass-renderer.ts')],bundle:true,format:'iife',platform:'browser',outfile:path.join(output,'fixture.js')});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0;background:#111}#stage{position:relative;width:640px;height:360px}</style><div id="stage"></div><script src="/fixture.js"></script>');return;}
    const file=url.pathname==='/fixture.js'?path.join(output,'fixture.js'):url.pathname==='/fixture.ass'?path.join(root,'tests/fixtures/ass-features.ass'):path.resolve(root,'public','.'+url.pathname);
    if(!file.startsWith(root+path.sep))throw Error('path');
    res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'application/javascript':file.endsWith('.woff2')?'font/woff2':'text/plain');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.ASS_TEST_BROWSER || (process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined),headless:true});
const results=[];
try{
  for(const legacy of [false,true]){
    console.log("Testing backend",legacy?"compatibility":"current");
    const page=await browser.newPage({viewport:{width:640,height:360}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{ if(message.type()==='warning'||message.type()==='error'||message.text().startsWith('ASS compatibility'))console.log(message.text()); });
    if(legacy)await page.addInitScript(()=>{window.OffscreenCanvas=undefined;});
    await page.goto(origin);await page.evaluate(()=>window.assCheck.load());
    const capture=async(label)=>{const png=await page.screenshot({path:path.join(output,(legacy?'legacy-':'modern-')+label+'.png')});return sharp(png).removeAlpha().raw().toBuffer();};
    const blank=await capture('blank');
    await page.evaluate(()=>window.assCheck.frame(2));await page.waitForTimeout(500);await page.evaluate(()=>window.assCheck.frame(2));
    const first=await capture('effects-2s');
    let green=0, misplaced=0, ink=0;
    for(let y=0;y<360;y++)for(let x=0;x<640;x++){const i=(y*640+x)*3;const [r,g,b]=first.subarray(i,i+3);if(r+g+b>100)ink++;if(g>170&&r<60&&b<60){green++;if(x>122||y<38||y>102)misplaced++;}}
    assert(green>3000,'vector drawing and clipping rendered');assert(misplaced<20,'ASS coordinates and clipping retained');assert(ink>5000,'styled text rendered');assert(!first.equals(blank),'subtitles appear at cue time');
    await page.evaluate(()=>window.assCheck.offset(2,0));await page.waitForTimeout(100);assert(!(await capture("offset-active")).equals(blank),"offset moves ASS dialogue and effects together");await page.evaluate(()=>window.assCheck.offset(0,4));const later=await capture('effects-4s');assert(!later.equals(first),'karaoke, movement and transforms advance');
    await page.evaluate(()=>window.assCheck.offset(3,7));const gone=await capture('offset-ended');assert(gone.equals(blank),'offset applies to all ASS effects and expiry');
    await page.evaluate(()=>window.assCheck.offset(0,2));await page.evaluate(()=>window.assCheck.packets());await page.waitForTimeout(500);await page.evaluate(()=>window.assCheck.frame(2));const packet=await capture('packet-track');assert(!packet.equals(blank),'native packet track redraws');assert(packet.equals(first),'packet updates retain every original style and effect');
    await page.evaluate(()=>window.assCheck.clear());assert(await page.locator('canvas').count()===0,'renderer cleanup removes its canvas');assert.deepEqual(errors,[]);
    results.push({backend:legacy?'compatibility libass':'current libass',greenPixels:green,styledPixels:ink});await page.close();
  }
  console.log(JSON.stringify({passed:true,results,screenshots:output},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
