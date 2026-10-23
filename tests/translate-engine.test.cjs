const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const {
  TranslationEngine,
  engineOptions,
} = require("../desktop/runtime/translate/supervisor.cjs");

const name =
  process.platform === "win32" ? "tatakai-translate.exe" : "tatakai-translate";
const binary =
  process.env.TATAKAI_TRANSLATE_TEST_BINARY ||
  engineOptions({isPackaged:false,getPath:()=>os.tmpdir()}).binary;

test("development engine location is independent of Electron entry directory", () => {
  for (const appPath of [path.resolve('.'), path.resolve('desktop')]) {
    const options=engineOptions({isPackaged:false,getAppPath:()=>appPath,getPath:()=>os.tmpdir()});
    assert.equal(options.binary,engineOptions({isPackaged:false,getPath:()=>os.tmpdir()}).binary);
    assert.ok(options.binary.startsWith(path.resolve('resources/bin/translate-engine',process.arch)+path.sep));
  }
});
function png() {
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, body) => {
    const type = Buffer.from(kind);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, body])));
    return Buffer.concat([size, type, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(32, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.alloc(32 * (32 * 4 + 1), 255);
  for (let i = 0; i < 32; i++) pixels[i * 129] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function completion(engine) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      engine.off("event", listen);
      reject(new Error("Processing timed out"));
    }, 20000);
    function listen(event) {
      if (event.event === "complete" || event.event === "error") {
        clearTimeout(timer);
        engine.off("event", listen);
        resolve(event);
      }
    }
    engine.on("event", listen);
  });
}

test('translation uses surrounding story context in reading order and rejects incomplete batches atomically', {
  timeout:90000, skip:!fs.existsSync(binary)&&'Build the native engine first',
}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yomi-context-'));
  const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
  const requests=[];let mode='valid';
  const server=http.createServer((req,res)=>{
    let bytes='';req.on('data',chunk=>bytes+=chunk);req.on('end',()=>{
      const body=JSON.parse(bytes);requests.push(body);
      const input=JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));
      const values=input.requestedTexts.map(text=>mode==='empty'?'':`Target: ${text}`);
      if(mode==='short')values.pop();
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(values)}}]}));
    });
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let current=await engine.request('create',{name:'Context',credit:{name:'Offline',userId:null},targetLanguage:'ar'});
    const paths=[1,2,3].map(index=>{const file=path.join(root,`page${index}.png`);fs.writeFileSync(file,png());return file;});
    current=await engine.request('import',{paths,revision:current.revision});
    const style={family:'sans-serif',size:12,weight:400,italic:false,fill:[0,0,0,255],stroke:[255,255,255,255],strokeWidth:0,align:'center',direction:'auto',autoFit:true};
    const layer=(id,source,y,translation='',edited=false)=>({id,name:'Dialogue',kind:'text',source,translation,sourceEdited:false,translationEdited:edited,x:0,y,width:100,height:50,rotation:0,opacity:1,visible:true,style});
    current.pages[0].layers=[layer('previous','The knight named Ren',0,'Established name')];
    current.pages[1].layers=[layer('last','...is a separate reality.',20),layer('manual','Keep my wording.',10,'Manual wording',true),layer('first','This place...',0)];
    current.pages[2].layers=[layer('next','No one can interfere.',0)];
    current=await engine.request('commit',{project:current,revision:current.revision});
    await engine.request('saveSettings',{settings:{providers:[{id:'fixture',name:'Fixture',kind:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture'}],translationProvider:'fixture',visionProvider:null}});
    const process=async(layerIds)=>{
      const done=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[current.pages[1].id],...(layerIds?{layerIds}:{}),stages:['translate']});
      const event=await done;current=(await engine.request('status')).project;return event;
    };
    assert.equal((await process()).event,'complete');
    const input=JSON.parse(requests[0].messages[1].content.split('\n').slice(1).join('\n'));
    assert.deepEqual(input.requestedTexts,['This place...','...is a separate reality.']);
    assert.deepEqual(input.context.pages.map(page=>page.relation),['previous','current','next']);
    assert.equal(input.context.pages[0].regionsInReadingOrder[0].existingTranslation,'Established name');
    assert.equal(input.context.pages[1].regionsInReadingOrder[1].existingTranslation,'Manual wording');
    assert.equal(current.pages[1].layers.find(layer=>layer.id==='last').translation,'Target: ...is a separate reality.');
    assert.equal(current.pages[1].layers.find(layer=>layer.id==='manual').translation,'Manual wording');
    assert.match(requests[0].messages[0].content,/negation/);
    for(const invalid of ['empty','short']){
      mode=invalid;const revision=current.revision;
      assert.equal((await process(['first'])).event,'error');
      assert.equal(current.revision,revision,'invalid results must not erase successful translations');
    }
    mode='valid';assert.equal((await process(['last'])).event,'complete');
    const selected=JSON.parse(requests.at(-1).messages[1].content.split('\n').slice(1).join('\n'));
    assert.deepEqual(selected.requestedTexts,['...is a separate reality.']);
    assert.equal(selected.context.pages[1].regionsInReadingOrder[0].source,'This place...','selected-layer translation still needs surrounding dialogue');
    assert.equal(selected.context.pages[1].regionsInReadingOrder[0].existingTranslation,'','a retry must not treat previous automatic wording as approved terminology');
  } finally {
    const exited=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exited;
    await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
  }
});

test('assistant creates undoable layers and translates an empty page using the user-selected language/script', {
  timeout:90000, skip:!fs.existsSync(binary)&&'Build the native engine first',
}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tatakai-assistant-'));
  const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
  let pageId, mode='create';const requests=[];
  const server=http.createServer((req,res)=>{
    let bytes='';req.on('data',chunk=>bytes+=chunk);req.on('end',()=>{
      const body=JSON.parse(bytes);requests.push(body);
      const system=body.messages[0].content;
      let content;
      if(system.includes("project assistant")) {
        content=mode==='create'?{message:'Added a text box.',creates:[{pageId}]}:
          mode==='invalid'?{message:'Invalid plan',creates:[{pageId:'unknown-page'}]}:
          {message:'Process the page.',targetLanguage:'ja-Latn',pipeline:{pageIds:[pageId],stages:['detect','ocr','translate']}};
      } else if(system.includes('detect and transcribe')) content={coordinateSpace:'normalized1000',regions:[{x:31.25,y:31.25,width:875,height:875,text:'Original dialogue'}]};
      else if(system.includes('transcribe manga')) content=['Original dialogue'];
      else content=['Konnichiwa'];
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));
    });
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let current=await engine.request('create',{name:'Assistant',credit:{name:'Offline',userId:null},targetLanguage:'es'});
    const source=path.join(root,'page.png');fs.writeFileSync(source,png());
    current=await engine.request('import',{paths:[source],revision:current.revision});pageId=current.pages[0].id;
    const settings={providers:[{id:'fixture',name:'Fixture',kind:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture'}],translationProvider:'fixture',visionProvider:'fixture'};
    await engine.request('saveSettings',{settings});
    const ask=async(prompt,history=[])=>{
      const done=completion(engine);
      await engine.request('assistant',{revision:current.revision,prompt,pageId,visual:false,history});
      const event=await done;current=(await engine.request('status')).project;return event;
    };
    assert.equal((await ask('Add a text layer')).event,'complete');
    assert.equal(current.pages[0].layers.length,1);
    assert.equal(current.targetLanguage,'es','adding text must preserve the user-selected target');
    current=await engine.request('undo',{revision:current.revision});assert.equal(current.pages[0].layers.length,0);
    mode='invalid';const revision=current.revision;
    assert.equal((await ask('Add invalid layer')).event,'error');assert.equal(current.revision,revision);
    mode='translate';await engine.request('saveSettings',{settings:{...settings,visionProvider:null}});
    const missing=await ask('Translate the page');assert.equal(missing.event,'error');assert.match(missing.message,/vision-capable/);assert.equal(current.revision,revision);
    await engine.request('saveSettings',{settings});
    const done=await ask('Yes, translate it',[{role:'You',text:'Translate into Japanese using Latin letters'}]);
    assert.equal(done.event,'complete');assert.match(done.result.message,/1 text layer/);
    assert.equal(current.targetLanguage,'ja-Latn');assert.equal(current.pages[0].layers[0].source,'Original dialogue');assert.equal(current.pages[0].layers[0].translation,'Konnichiwa');
    const planner=requests.filter(r=>r.messages[0].content.includes('project assistant')).at(-1);
    assert.ok(planner.messages[1].content.includes('Japanese using Latin letters'));
    const translation=requests.at(-1);assert.match(translation.messages[1].content,/ja-Latn/);assert.match(translation.messages[0].content,/romanization/);
    current=await engine.request('undo',{revision:current.revision});assert.equal(current.pages[0].layers[0].translation,'');
  } finally{
    const exited=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exited;
    await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
  }
});

test('diffusion cleanup preserves unmasked pixels, stores provenance, is undoable and cancels its own job', {
  timeout:90000,skip:!fs.existsSync(binary)&&'Build the native engine first',
},async()=>{
  const sharp=require('sharp');const root=fs.mkdtempSync(path.join(os.tmpdir(),'tatakai-cleanup-'));
  const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
  let mode='complete',jobs=0,cancellations=0,jobInput,polled;
  const server=http.createServer((req,res)=>{
    let bytes='';req.on('data',chunk=>bytes+=chunk);req.on('end',()=>{void(async()=>{
      res.setHeader('Content-Type','application/json');
      if(req.url==='/sdcpp/v1/img_gen') {jobs++;jobInput=JSON.parse(bytes);assert.ok(jobInput.mask_image);assert.ok(jobInput.init_image);res.statusCode=202;return res.end(JSON.stringify({id:`job_${jobs}`,status:'queued'}));}
      if(req.url.endsWith('/cancel')) {cancellations++;return res.end('{}');}
      if(mode==='cancel'){polled?.();return res.end(JSON.stringify({status:'generating'}));}
      const width=mode==='mismatch'?8:jobInput.width,height=mode==='mismatch'?8:jobInput.height;
      const image=await sharp({create:{width,height,channels:4,background:{r:128,g:128,b:128,alpha:1}}}).png().toBuffer();
      res.end(JSON.stringify({status:'completed',result:{images:[{b64_json:image.toString('base64')}]}}));
    })().catch(error=>{res.statusCode=500;res.end(JSON.stringify({error:error.message}));});});
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let current=await engine.request('create',{name:'Cleanup',credit:{name:'Offline',userId:null},targetLanguage:'fr'});
    const raw=Buffer.alloc(32*32*4,255);for(let y=10;y<18;y++)for(let x=10;x<18;x++)raw.fill(0,(y*32+x)*4,(y*32+x)*4+3);
    raw.set([32,64,192,255],(28*32+28)*4);
    const file=path.join(root,'page.png');await sharp(raw,{raw:{width:32,height:32,channels:4}}).png().toFile(file);
    current=await engine.request('import',{paths:[file],revision:current.revision});const pageId=current.pages[0].id;
    current.pages[0].layers.push({id:'region',name:'Outside text',kind:'text',x:6,y:6,width:18,height:18,rotation:0,opacity:1,visible:true,source:'Text',translation:'',sourceEdited:false,translationEdited:false,style:{family:'sans-serif',size:8,weight:400,italic:false,fill:[0,0,0,255],stroke:[255,255,255,255],strokeWidth:0,align:'center',direction:'auto',autoFit:true}});
    current=await engine.request('commit',{project:current,revision:current.revision});
    const settings={providers:[],translationProvider:null,visionProvider:null,workflow:{includeOutsideText:true,cleanup:{mode:'diffusion',endpoint:`http://127.0.0.1:${server.address().port}`,steps:4,strength:0.9}}};
    await engine.request('saveSettings',{settings});
    const start=async()=>{const done=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[pageId],stages:['cleanup']});return done;};
    assert.equal((await start()).event,'complete');current=(await engine.request('status')).project;
    assert.equal(current.pages[0].layers.length,2);assert.equal(current.pages[0].layers[0].cleanup.method,'diffusion');assert.equal(current.pages[0].layers[0].cleanup.sourceBlob,current.pages[0].blob);
    assert.match(current.pages[0].layers[0].cleanup.mask,/^[a-f0-9]{64}$/);
    const rendered=await engine.request('render',{pageId});const pixels=await sharp(Buffer.from(rendered.png,'base64')).raw().toBuffer();
    assert.deepEqual([...pixels.subarray((14*32+14)*4,(14*32+14)*4+4)],[128,128,128,255]);
    assert.deepEqual([...pixels.subarray((28*32+28)*4,(28*32+28)*4+4)],[32,64,192,255]);
    assert.deepEqual([...pixels.subarray(0,4)],[255,255,255,255]);
    assert.equal((await start()).event,'complete');assert.equal(jobs,1,'identical cleanup must not run inference again');
    current=await engine.request('undo',{revision:current.revision});assert.equal(current.pages[0].layers.length,1);
    const revision=current.revision;mode='mismatch';const invalid=await start();assert.equal(invalid.event,'error');assert.match(invalid.message,/dimensions/);assert.equal((await engine.request('status')).project.revision,revision);
    mode='cancel';const waiting=new Promise(resolve=>{polled=resolve;});const done=completion(engine);
    await engine.request('process',{revision:current.revision,pageIds:[pageId],stages:['cleanup']});await waiting;await engine.request('cancel');
    assert.equal((await done).event,'error');assert.ok(cancellations>=2);current=(await engine.request('status')).project;assert.equal(current.revision,revision);assert.equal(current.pages[0].layers.length,1);
    await assert.rejects(engine.request('saveSettings',{settings:{...settings,workflow:{...settings.workflow,cleanup:{...settings.workflow.cleanup,endpoint:'https://example.com'}}}}),/local runtime/);
    mode='complete';assert.equal((await start()).event,'complete');current=(await engine.request('status')).project;
    const correctedId=current.pages[0].layers[0].id;
    const stale=JSON.parse(JSON.stringify(current.pages[0].layers[0]));stale.id='stale-generated-cleanup';current.pages[0].layers.push(stale);
    current=await engine.request('commit',{project:current,revision:current.revision});
    current=await engine.request('stroke',{revision:current.revision,pageId,layerId:correctedId,mode:'brush',diameter:2,color:[255,0,0,255],points:[[14,14]]});
    assert.equal(current.pages[0].layers.find(layer=>layer.id===correctedId).cleanup.edited,true);
    await engine.request('saveSettings',{settings:{...settings,workflow:{...settings.workflow,cleanup:{...settings.workflow.cleanup,steps:5}}}});
    assert.equal((await start()).event,'complete');current=(await engine.request('status')).project;
    assert.ok(!current.pages[0].layers.some(layer=>layer.id===stale.id),'full-page cleanup must replace stale generated masks');
    assert.equal(current.pages[0].layers.filter(layer=>layer.cleanup).length,2,'keep the manually corrected layer above the new automatic cleanup');
    assert.equal(current.pages[0].layers[1].id,correctedId);
    const corrected=await engine.request('render',{pageId});const correctedPixels=await sharp(Buffer.from(corrected.png,'base64')).raw().toBuffer();
    const brushPixel=[...correctedPixels.subarray((14*32+14)*4,(14*32+14)*4+4)];
    assert.ok(brushPixel[0]>200&&brushPixel[1]<60&&brushPixel[2]<60,'the red manual brush correction must remain visible above automatic cleanup');
  }finally{
    const exited=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exited;await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
  }
});

test('custom font imports are portable, validated and survive removal of the original font',{
  timeout:60000,skip:!fs.existsSync(binary)&&'Build the native engine first',
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tatakai-font-'));const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
  try{
    let current=await engine.request('create',{name:'Fonts',credit:{name:'Offline',userId:null},targetLanguage:'en'});
    const file=path.join(root,'custom.ttf');fs.copyFileSync(path.join(__dirname,'fixtures/translate/TatakaiFixture.ttf'),file);
    const imported=await engine.request('importFont',{path:file,revision:current.revision});current=imported.project;assert.equal(imported.family,'Tatakai Fixture');assert.equal(current.fonts.length,1);fs.unlinkSync(file);
    const image=path.join(root,'page.png');fs.writeFileSync(image,png());current=await engine.request('import',{paths:[image],revision:current.revision});
    current.pages[0].layers.push({id:'font-text',name:'A',kind:'text',x:0,y:0,width:32,height:32,rotation:0,opacity:1,visible:true,source:'A',translation:'A',sourceEdited:true,translationEdited:true,style:{family:imported.family,size:20,weight:400,italic:false,fill:[0,0,0,255],stroke:[255,255,255,255],strokeWidth:0,align:'center',direction:'auto',autoFit:true}});
    current=await engine.request('commit',{project:current,revision:current.revision});const render=await engine.request('render',{pageId:current.pages[0].id});
    const backup=path.join(root,'font-project.zip');await engine.request('backup',{path:backup});await engine.request('close');current=await engine.request('restore',{path:backup});
    assert.equal(current.fonts[0].family,'Tatakai Fixture');assert.equal((await engine.request('render',{pageId:current.pages[0].id})).png,render.png);
    fs.writeFileSync(file,'not a font');await assert.rejects(engine.request('importFont',{path:file,revision:current.revision}),/supported font/);assert.equal((await engine.request('status')).project.revision,current.revision);
  }finally{const exited=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exited;fs.rmSync(root,{recursive:true,force:true});}
});

test('long-page vision uses readable crops, repairs automatic boxes and cleans original lettering near the page bottom',{
 timeout:90000,skip:!fs.existsSync(binary)&&'Build the native engine first',
},async()=>{
 const sharp=require('sharp');const root=fs.mkdtempSync(path.join(os.tmpdir(),'yomi-tall-page-'));const engine=new TranslationEngine({binary,root:path.join(root,'projects')});
 let crops=0,ocr=0,retries=0;let seen=[];
 const server=http.createServer((req,res)=>{let bytes='';req.on('data',chunk=>bytes+=chunk);req.on('end',()=>{void(async()=>{
  const body=JSON.parse(bytes),system=body.messages[0].content;let result;
  if(system.includes('detect and transcribe')){
   // Exercise one transient provider rate limit without throwing away the crop.
   if(retries++===0){res.statusCode=429;res.setHeader('Retry-After','1');return res.end('{}');}
   crops++;const encoded=body.messages[1].content.find(p=>p.type==='image_url').image_url.url.split(',')[1];const meta=await sharp(Buffer.from(encoded,'base64')).metadata();seen.push(meta.height);
   result={coordinateSpace:'normalized1000',regions:crops===7?[{x:100,y:500,width:500,height:200,text:'A',kind:'outside'}]:[]};
  }else if(system.includes('transcribe manga')){ocr++;const encoded=body.messages[1].content.find(p=>p.type==='image_url').image_url.url.split(',')[1];const meta=await sharp(Buffer.from(encoded,'base64')).metadata();assert.ok(meta.height<700,'OCR must see a text crop, not the entire tall page');result=['A'];}
  else result=['Translated'];
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
 })().catch(error=>{res.statusCode=500;res.end(JSON.stringify({error:error.message}));});});});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let current=await engine.request('create',{name:'Tall page',credit:{name:'Offline',userId:null},targetLanguage:'es'});
  const width=72,height=7055,raw=Buffer.alloc(width*height*4,255);for(let y=6650;y<6680;y++)for(let x=15;x<30;x++)raw.fill(0,(y*width+x)*4,(y*width+x)*4+3);
  const image=path.join(root,'page.png');await sharp(raw,{raw:{width,height,channels:4}}).png().toFile(image);current=await engine.request('import',{paths:[image],revision:current.revision});const pageId=current.pages[0].id;
  const style={family:'sans-serif',size:8,weight:400,italic:false,fill:[0,0,0,255],stroke:[255,255,255,255],strokeWidth:0,align:'center',direction:'auto',autoFit:true};
  const layer={id:'old-auto',name:'Old wrong box',kind:'text',x:1,y:1,width:5,height:5,rotation:0,opacity:1,visible:true,source:'Bad automatic box',translation:'Old output',sourceEdited:false,translationEdited:false,style};
  current.pages[0].layers.push(layer,{...layer,id:'manual',name:'Manual',x:50,y:20,width:20,height:20,source:'Authored',translation:'Keep',sourceEdited:true,translationEdited:true});current=await engine.request('commit',{project:current,revision:current.revision});
  await engine.request('saveSettings',{settings:{providers:[{id:'fixture',name:'Fixture',kind:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture'}],translationProvider:'fixture',visionProvider:'fixture'}});
  const done=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[pageId],stages:['detect','ocr','translate','cleanup']});assert.equal((await done).event,'complete');current=(await engine.request('status')).project;
  assert.equal(crops,7);assert.equal(ocr,0,'reuse transcription from detection during the combined run');assert.ok(seen.every(height=>height<=1280));assert.equal(seen.at(-1),911);
  const read=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[pageId],stages:['ocr']});assert.equal((await read).event,'complete');assert.equal(ocr,1);current=(await engine.request('status')).project;
  assert.ok(!current.pages[0].layers.some(l=>l.id==='old-auto'));assert.equal(current.pages[0].layers.find(l=>l.id==='manual').translation,'Keep');
  const detected=current.pages[0].layers.find(l=>l.sourceRegion);assert.ok(detected.y>6500);assert.equal(detected.translation,'Translated');assert.equal(current.pages[0].layers.filter(l=>l.cleanup).length,1);
  for(const text of current.pages[0].layers.filter(l=>l.kind==='text'))text.visible=false;
  current=await engine.request('commit',{project:current,revision:current.revision});const rendered=await engine.request('render',{pageId});const pixels=await sharp(Buffer.from(rendered.png,'base64')).raw().toBuffer();
  assert.deepEqual([...pixels.subarray((6660*width+20)*4,(6660*width+20)*4+4)],[255,255,255,255],'original bottom lettering must be removed');
  const cached=completion(engine);await engine.request('process',{revision:current.revision,pageIds:[pageId],stages:['detect','ocr']});assert.equal((await cached).event,'complete');assert.equal(crops,7,'completed vision crops should be reused');assert.equal(ocr,1);current=(await engine.request('status')).project;
  const backup=path.join(root,'cached-project.zip');await engine.request('backup',{path:backup});await engine.request('close');const restored=await engine.request('restore',{path:backup});assert.ok(restored.pages[0].layers.some(l=>l.sourceRegion),'source geometry must survive portable restore without temporary caches');
 }finally{const exited=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();engine.stop();await exited;await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test(
  "native protocol: import, authored text, pipeline, cancellation, export and reopen",
  {
    timeout: 90000,
    skip:
      !fs.existsSync(binary) &&
      "Build the engine first with npm run translate:build",
  },
  async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "tatakai-translate-engine-")
    );
    const engine = new TranslationEngine({
      binary,
      root: path.join(root, "projects"),
    });
    let delay = false;
    let server;
    try {
      server = http.createServer((req, res) => {
        let bytes = "";
        req.on("data", (chunk) => (bytes += chunk));
        req.on("end", () => {
          const body = JSON.parse(bytes);
          assert.equal(req.url, "/v1/chat/completions");
          assert.equal(body.model, "fixture");
          const reply = () => {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                choices: [{ message: { content: '["Translated dialogue"]' } }],
              })
            );
          };
          if (delay) setTimeout(reply, 500);
          else reply();
        });
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const project = await engine.request("create", {
        name: "Integration",
        credit: { name: "Translator", userId: "account-1" },
        targetLanguage: "hi",
        mapping: {
          mangaId: "123",
          chapterId: "chapter-1",
          sourceId: "fixture",
          title: "Manga",
        },
      });
      const source = path.join(root, "page2.png");
      fs.writeFileSync(source, png());
      let current = await engine.request("import", {
        paths: [source],
        revision: project.revision,
      });
      fs.unlinkSync(source);
      const text = {
        id: "text-1",
        name: "Dialogue",
        visible: true,
        opacity: 1,
        x: 1,
        y: 1,
        width: 28,
        height: 28,
        rotation: 0,
        kind: "text",
        source: "Source",
        translation: "",
        sourceEdited: true,
        translationEdited: false,
        style: {
          family: "sans-serif",
          size: 8,
          weight: 400,
          italic: false,
          fill: [0, 0, 0, 255],
          stroke: [255, 255, 255, 255],
          strokeWidth: 0,
          align: "center",
          direction: "auto",
          autoFit: true,
        },
      };
      current.pages[0].layers.push(text);
      current = await engine.request("commit", {
        project: current,
        revision: current.revision,
      });
      await assert.rejects(
        engine.request("commit", { project: current, revision: 0 }),
        /Stale/
      );
      await engine.request("saveSettings", {
        settings: {
          providers: [
            {
              id: "fixture",
              name: "Local fixture",
              kind: "openai-compatible",
              endpoint: `http://127.0.0.1:${server.address().port}/v1`,
              model: "fixture",
            },
          ],
          translationProvider: "fixture",
          visionProvider: null,
        },
      });
      let done = completion(engine);
      await engine.request("process", {
        revision: current.revision,
        pageIds: [current.pages[0].id],
        layerIds: [],
        stages: ["translate"],
      });
      assert.equal((await done).event, "error");
      assert.equal(
        (await engine.request("status")).project.revision,
        current.revision
      );
      done = completion(engine);
      await engine.request("process", {
        revision: current.revision,
        pageIds: [current.pages[0].id],
        stages: ["translate"],
      });
      assert.equal((await done).event, "complete");
      current = (await engine.request("status")).project;
      assert.equal(
        current.pages[0].layers[0].translation,
        "Translated dialogue"
      );
      current.pages[0].layers[0].translation = "Authored";
      current.pages[0].layers[0].translationEdited = true;
      current = await engine.request("commit", {
        project: current,
        revision: current.revision,
      });
      done = completion(engine);
      await engine.request("process", {
        revision: current.revision,
        pageIds: [current.pages[0].id],
        stages: ["translate"],
      });
      await done;
      assert.equal(
        (await engine.request("status")).project.pages[0].layers[0].translation,
        "Authored"
      );
      current.pages[0].layers[0].translationEdited = false;
      current = await engine.request("commit", {
        project: current,
        revision: current.revision,
      });
      delay = true;
      done = completion(engine);
      await engine.request("process", {
        revision: current.revision,
        pageIds: [current.pages[0].id],
        stages: ["translate"],
      });
      await engine.request("cancel");
      assert.equal((await done).event, "error");
      current = (await engine.request("status")).project;
      assert.equal(current.pages[0].layers[0].translation, "Authored");
      const render = await engine.request("render", {
        pageId: current.pages[0].id,
      });
      assert.ok(Buffer.from(render.png, "base64").length > 0);
      const {exportPsd}=require('../desktop/runtime/translate/psd.cjs');
      const {readPsd}=require('ag-psd');const sharp=require('sharp');
      const psdDirectory=path.join(root,'psd');fs.mkdirSync(psdDirectory);
      await exportPsd(engine,{path:psdDirectory,revision:current.revision,pageIds:[current.pages[0].id]});
      const psdManifest=JSON.parse(fs.readFileSync(path.join(psdDirectory,'tatakai-translation.json')));
      const layered=readPsd(fs.readFileSync(path.join(psdDirectory,psdManifest.files[0])),{useImageData:true});
      assert.equal(layered.children.find(layer=>layer.text)?.text.text,'Authored');
      assert.equal(layered.children[0].text.text,'Authored');
      assert.equal(layered.children.length,2);
      const nativeRaw=await sharp(Buffer.from(render.png,'base64')).ensureAlpha().raw().toBuffer();
      assert.deepEqual(Buffer.from(layered.imageData.data),nativeRaw);
      const output = path.join(root, "exports");
      fs.mkdirSync(output);
      await engine.request("export", {
        path: output,
        revision: current.revision,
        pageIds: [current.pages[0].id],
        format: "png",
      });
      const manifest = JSON.parse(
        fs.readFileSync(path.join(output, "tatakai-translation.json"))
      );
      assert.equal(manifest.translator.userId, "account-1");
      assert.equal(manifest.targetLanguage, "hi");
      assert.equal(manifest.mapping.mangaId, "123");
      assert.deepEqual(
        fs.readFileSync(path.join(output, manifest.files[0])),
        Buffer.from(render.png, "base64")
      );
      await engine.request("close");
      current = await engine.request("open", { id: current.id });
      assert.equal(current.pages[0].layers[0].translation, "Authored");
      const backup = path.join(root, "backup.zip");
      await engine.request("backup", { path: backup });
      assert.ok(fs.statSync(backup).size > 0);
      const retained = structuredClone(current);
      current.pages[0].label = "Renamed page";
      current = await engine.request("commit", {
        project: current,
        revision: current.revision,
      });
      assert.equal(current.pages[0].label, "Renamed page");
      current.pages = [];
      current = await engine.request("commit", {
        project: current,
        revision: current.revision,
      });
      current = await engine.request("undo", { revision: current.revision });
      assert.equal(current.pages[0].label, "Renamed page");
      await engine.request("close");
      await engine.request("delete", { id: retained.id });
      assert.deepEqual(await engine.request("list"), []);
      const restored = await engine.request('restore', { path: backup });
      assert.notEqual(restored.id, retained.id);
      assert.equal(restored.credit.userId, 'account-1');
      assert.equal(restored.pages[0].layers[0].translation, 'Authored');
      const restoredRender=await engine.request('render',{pageId:restored.pages[0].id});
      assert.equal(restoredRender.png,render.png);
      await engine.request('close');await engine.request('delete',{id:restored.id});
    } finally {
      const exited = engine.child
        ? new Promise((resolve) => engine.child.once("exit", resolve))
        : Promise.resolve();
      engine.stop();
      await exited;
      if (server) await new Promise((resolve) => server.close(resolve));
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);
