'use strict';
// Run with Electron to verify the actual main-process path and native handshake.
const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {TranslationEngine,engineOptions}=require('../desktop/runtime/translate/supervisor.cjs');
app.whenReady().then(async()=>{
    let engine;
    let root;
    try{
        root=await fs.mkdtemp(path.join(os.tmpdir(),'tatakai-startup-'));
        const options=engineOptions(app);
        engine=new TranslationEngine({...options,root});
        const projects=await engine.request('list');
        if(!Array.isArray(projects))throw Error('Invalid native library response');
        process.stdout.write(`Translate Electron startup passed (${process.platform}/${process.arch}).\n`);
        const exited=new Promise(resolve=>engine.child.once('exit',resolve));
        engine.stop();await exited;engine=null;
        await fs.rm(root,{recursive:true,force:true});root=null;
        app.exit(0);
    }catch(error){
        engine?.stop();
        process.stderr.write(`${error.message}\n`);
        app.exit(1);
    }
});
