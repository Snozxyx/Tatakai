'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const model=require('./offline-model.json');
const {ensureRuntime}=require('./local-model.cjs');
const {downloadAsset,verified}=require('./model-download.cjs');

class OfflinePack {
  constructor(root, runtimeRoot, localModel, progress=()=>{}) {
    this.directory = path.join(root, `${model.id}-${model.revision}`);
    this.runtimeRoot = runtimeRoot; this.localModel = localModel; this.progress = progress;
    this.controller = null; this.starting = null; this.loadController=null; this.message = '';
  }
  async status() {
    const available = await Promise.all(model.files.map(async asset=>{
      try { const stat=await fs.lstat(path.join(this.directory,asset.name)); return stat.isFile() && !stat.isSymbolicLink() && stat.size===asset.bytes; } catch { return false; }
    }));
    return {installed:available.every(Boolean),installing:!!this.controller,message:this.message,name:model.name,bytes:model.files.reduce((sum,file)=>sum+file.bytes,0),source:model.source,license:model.license};
  }
  report(message) { this.message=message; this.progress(message); }
  async install() {
    if (this.controller || this.starting) throw Error('Offline setup is already running.');
    const controller = new AbortController(); this.controller=controller;
    try {
      await fs.mkdir(this.directory,{recursive:true});
      if ((await fs.lstat(this.directory)).isSymbolicLink()) throw Error('The model directory cannot be a symbolic link.');
      await ensureRuntime(this.runtimeRoot, message=>this.report(message), {signal:controller.signal});
      let complete=0, last=0; const total=model.files.reduce((sum,file)=>sum+file.bytes,0);
      for (const asset of model.files) {
        controller.signal.throwIfAborted(); this.report(`Preparing ${asset.role==='model'?'translation model':'text-reading model'}…`);
        await downloadAsset(path.join(this.directory,asset.name),asset,`${model.source}/resolve/${model.revision}/${asset.name}?download=true`,{signal:controller.signal,progress:bytes=>{
          if(Date.now()-last>500){last=Date.now();this.report(`Downloading offline models · ${Math.round((complete+bytes)/total*100)}%`);}
        }});
        complete+=asset.bytes;
      }
      this.report('Offline models verified and ready.');
      return this.status();
    } catch(error) {
      if(controller.signal.aborted) throw Error('Offline setup cancelled. Completed verified files were kept; choose Download to resume.');
      throw error;
    } finally { this.controller=null; }
  }
  cancel() { this.controller?.abort(); this.loadController?.abort(); }
  async load() {
    if (this.controller) throw Error('Finish or cancel the model download before processing.');
    if (this.starting) return this.starting;
    const loading=new AbortController();this.loadController=loading;
    this.starting=(async()=>{
      this.report('Checking the offline models…');
      for(const asset of model.files) if(!await verified(path.join(this.directory,asset.name),asset)) throw Error('Offline models are missing or damaged. Open Processing settings and download the offline models, or load your own vision GGUF.');
      this.report('Loading the offline text-reading and translation model…');
      loading.signal.throwIfAborted();
      return this.localModel.start(path.join(this.directory,model.files[0].name),path.join(this.directory,model.files[1].name),{offline:true,signal:loading.signal});
    })();
    try { const connection=await this.starting;this.report('Ready · processing stays on this device.');return connection; }
    finally { this.starting=null;this.loadController=null; }
  }
}
module.exports={OfflinePack,downloadAsset,verified};
