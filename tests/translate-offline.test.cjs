'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {downloadAsset,verified}=require('../desktop/runtime/translate/offline-model-manager.cjs');
const {ensureRuntime,LocalModel}=require('../desktop/runtime/translate/local-model.cjs');
const {TranslationEngine,engineOptions}=require('../desktop/runtime/translate/supervisor.cjs');
const binary=engineOptions({isPackaged:false,getPath:()=>os.tmpdir()}).binary;
const fixture=Buffer.from('GGUF'+('verified model fixture '.repeat(20)));
const asset={name:'fixture.gguf',bytes:fixture.length,sha256:crypto.createHash('sha256').update(fixture).digest('hex')};

test('offline model downloads stream, resume, verify integrity and never publish corrupt data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yomi-model-download-'));
 try{
  const file=path.join(root,asset.name);let requests=0;
  await fs.writeFile(file+'.part',fixture.subarray(0,23));
  await downloadAsset(file,asset,'https://publisher.example/model',{fetcher:async(_,options)=>{
   requests++;assert.equal(options.headers.Range,'bytes=23-');
   return new Response(fixture.subarray(23),{status:206,headers:{'content-length':String(fixture.length-23),'content-range':`bytes 23-${fixture.length-1}/${fixture.length}`}});
  }});
  assert.ok(await verified(file,asset));assert.equal(requests,1);
  await downloadAsset(file,asset,'unused',{fetcher:()=>{throw Error('Already verified models must not use the network');}});
  await fs.rm(file);
  await assert.rejects(downloadAsset(file,asset,'fixture',{fetcher:async()=>new Response(Buffer.alloc(fixture.length),{headers:{'content-length':String(fixture.length)}})}),/integrity/);
  await assert.rejects(fs.stat(file),{code:'ENOENT'});await assert.rejects(fs.stat(file+'.part'),{code:'ENOENT'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(downloadAsset(file,asset,'fixture',{signal:controller.signal,fetcher:()=>{throw Error('Cancelled downloads must not start');}}),{name:'AbortError'});
  await fs.writeFile(file+'.part',fixture.subarray(0,10));
  await downloadAsset(file,asset,'fixture',{fetcher:async()=>new Response(fixture,{status:200,headers:{'content-length':String(fixture.length)}})});
  assert.ok(await verified(file,asset),'servers without range support may restart the download safely');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('offline runtime startup fails locally when assets are missing, without downloading',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yomi-runtime-offline-'));const original=global.fetch;let requests=0;
 global.fetch=()=>{requests++;throw Error('Network forbidden');};
 try{await assert.rejects(ensureRuntime(root,()=>{},{allowDownload:false}),/offline runtime is not installed/);assert.equal(requests,0);}
 finally{global.fetch=original;await fs.rm(root,{recursive:true,force:true});}
});

test('cancelled model loading never starts a runtime or downloads assets',async()=>{
 const controller=new AbortController();controller.abort();const model=new LocalModel(os.tmpdir(),()=>{});
 await assert.rejects(model.start('not-selected.gguf',null,{offline:true,signal:controller.signal}),{name:'AbortError'});
 assert.equal(model.status().running,false);assert.equal(model.status().loading,false);
});

function completion(engine){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{engine.off('event',listen);reject(Error('Pipeline timed out'));},20000);function listen(event){if(event.event==='complete'||event.event==='error'){clearTimeout(timer);engine.off('event',listen);resolve(event);}}engine.on('event',listen);});}

test('vision repairs malformed responses, handles explicit pixel boxes and preserves projects on repeated failure; offline mode blocks remote calls',{
 timeout:60000,skip:!require('node:fs').existsSync(binary)&&'Build the native engine first',
},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yomi-vision-repair-'));const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
 let calls=0,mode='repair';
 const server=http.createServer((req,res)=>{let bytes='';req.on('data',chunk=>bytes+=chunk);req.on('end',()=>{
  calls++;const body=JSON.parse(bytes);assert.equal(body.response_format.type,'json_object');assert.ok(body.response_format.schema.required.includes('coordinateSpace'));const answer=mode==='invalid'||calls===1?[{x:10,y:10,width:50,height:30,text:'Read me'}]:{coordinateSpace:'pixels',regions:[{bbox:[10,10,60,40],text:'Read me',kind:'bubble',lettering:{family:'serif',weight:700,italic:true}}]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
 });});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let current=await engine.request('create',{name:'Repair',credit:{name:'Offline',userId:null},targetLanguage:'ar'});
  const file=path.join(root,'page.png');await require('sharp')({create:{width:80,height:80,channels:4,background:'#fff'}}).png().toFile(file);
  current=await engine.request('import',{paths:[file],revision:current.revision});const pageId=current.pages[0].id;
  const settings={offlineOnly:true,providers:[{id:'tatakai-local',name:'Local fixture',kind:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture'}],translationProvider:'tatakai-local',visionProvider:'tatakai-local'};
  await engine.request('attachLocalModel',{endpoint:settings.providers[0].endpoint,model:'fixture',key:'a'.repeat(64),vision:true});
  await engine.request('saveSettings',{settings});
  const run=async(stages)=>{const done=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[pageId],stages});const event=await done;current=(await engine.request('status')).project;return event;};
  assert.equal((await run(['detect'])).event,'complete');assert.equal(calls,2,'malformed detection gets one repair attempt');
  assert.equal(current.pages[0].layers.length,1);assert.equal(current.pages[0].layers[0].style.weight,700);assert.equal(current.pages[0].layers[0].x,10);
  current.pages[0].layers[0].sourceEdited=true;current.pages[0].layers[0].translation='Manual';current.pages[0].layers[0].translationEdited=true;
  current=await engine.request('commit',{project:current,revision:current.revision});const revision=current.revision;
  // Cached detections should not conceal a new provider response in this test.
  const projectDir=path.join(root,'projects',current.id+'.tatakaiproj');await fs.rm(path.join(projectDir,'vision-cache'),{recursive:true,force:true});
  mode='invalid';const invalid=await run(['detect']);assert.equal(invalid.event,'error');assert.match(invalid.message,/repair attempt/);assert.equal(current.revision,revision);assert.equal(current.pages[0].layers[0].translation,'Manual');
  await engine.request('saveSettings',{settings:{...settings,providers:[...settings.providers,{id:'remote',name:'Remote',kind:'openai-compatible',endpoint:'https://provider.invalid/v1',model:'remote'}],translationProvider:'remote'}});
  const before=calls;const blocked=await run(['detect','translate']);assert.equal(blocked.event,'error');assert.match(blocked.message,/Offline-only mode blocked/);assert.equal(calls,before,'preflight blocks the entire operation before any image is sent');assert.equal(current.revision,revision);
 }finally{const exit=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exit;await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}
});
