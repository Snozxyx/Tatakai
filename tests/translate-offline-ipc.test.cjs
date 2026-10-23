'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');
const {engineOptions}=require('../desktop/runtime/translate/supervisor.cjs');
const binary=engineOptions({isPackaged:false,getPath:()=>os.tmpdir()}).binary;
test('desktop offline setup selects both model roles and reloads cached models without a download; IPC remains scoped',{
 timeout:60000,skip:!fs.existsSync(binary)&&'Build the native engine first',
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yomi-offline-ipc-'));let installs=0,loads=0,connection;
 const localPath=require.resolve('../desktop/runtime/translate/local-model.cjs');const packPath=require.resolve('../desktop/runtime/translate/offline-model-manager.cjs');
 const localExports=require(localPath),packExports=require(packPath);let instance;
 class Local{constructor(){instance=this;this.connection=null;}status(){return {running:!!this.connection,loading:false,name:'Fixture',vision:true};}stop(){this.connection=null;}}
 class Pack{constructor(_root,_runtime,local){this.local=local;}async status(){return {installed:true,installing:false,message:'Ready',name:'Fixture',bytes:1,source:'https://publisher.example',license:'Apache-2.0'};}async install(){installs++;}async load(){loads++;this.local.connection=connection;return connection;}cancel(){}}
 require.cache[localPath].exports={...localExports,LocalModel:Local};require.cache[packPath].exports={...packExports,OfflinePack:Pack};
 const handlers=new Map(),events=[];const frame={};const window={isDestroyed:()=>false,webContents:{mainFrame:frame,send:(_,event)=>events.push(event)}};const event={sender:window.webContents,senderFrame:frame};
 let quit,engine;const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'["Local translation"]'}}]}));});});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));connection={endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture',vision:true,key:'a'.repeat(64)};
  const source=path.join(root,'page.png');await require('sharp')({create:{width:80,height:80,channels:4,background:'#fff'}}).png().toFile(source);
  engine=require('../desktop/ipc/ipc-translate.cjs')({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},app:{isPackaged:false,getPath:()=>root,once:(_,fn)=>{quit=fn;}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[source]})},getMainWindow:()=>window});
  const call=(name,args)=>handlers.get(name)(event,args);
  const request=(command,args={})=>call('translate:request',{command,args});
  await assert.rejects(handlers.get('translate:offline-setup')({...event,senderFrame:{}},{download:true}),/main Tatakai window/);assert.equal(installs,0);
  const status=await call('translate:offline-setup',{download:true});assert.equal(status.running,true);assert.equal(installs,1);assert.equal(loads,1);assert.ok(!JSON.stringify(status).includes(connection.key));
  const settings=await request('settings');assert.equal(settings.offlineOnly,true);assert.equal(settings.visionProvider,'tatakai-local');assert.equal(settings.translationProvider,'tatakai-local');
  let current=await request('create',{name:'Offline',credit:{name:'Local',userId:null},targetLanguage:'es'});current=await call('translate:import',{revision:current.revision});
  current.pages[0].layers.push({id:'text',name:'Text',kind:'text',x:0,y:0,width:70,height:60,rotation:0,visible:true,opacity:1,source:'Read me',translation:'',sourceEdited:false,translationEdited:false,style:{family:'sans-serif',size:12,weight:400,italic:false,fill:[0,0,0,255],stroke:[255,255,255,255],strokeWidth:0,align:'center',direction:'auto',autoFit:true}});
  current=await request('commit',{project:current,revision:current.revision});
  const process=async()=>{const before=events.length;await request('process',{revision:current.revision,pageIds:[current.pages[0].id],stages:['translate']});const deadline=Date.now()+15000;while(!events.slice(before).some(e=>e.event==='complete'||e.event==='error')){if(Date.now()>deadline)throw Error('Pipeline timed out');await new Promise(resolve=>setTimeout(resolve,25));}const result=events.slice(before).find(e=>e.event==='complete'||e.event==='error');assert.equal(result.event,'complete',result.message);current=(await request('status')).project;};
  await process();assert.equal(loads,1);await call('translate:model-stop');assert.equal(instance.connection,null);
  await process();assert.equal(loads,2,'first use after unloading/relaunch must reload cached models');assert.equal(installs,1,'processing must never download models automatically');assert.equal(current.pages[0].layers[0].translation,'Local translation');
 }finally{
  if(engine){const exit=engine.child?new Promise(resolve=>engine.child.once('exit',resolve)):Promise.resolve();quit();await exit;}
  require.cache[localPath].exports=localExports;require.cache[packPath].exports=packExports;
  await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
 }
});
