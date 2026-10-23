'use strict';
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const crypto=require('node:crypto');
async function verified(file,asset){
 try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.bytes)return false;
 const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')===asset.sha256;}catch{return false;}
}
async function downloadAsset(file,asset,url,{signal,progress=()=>{},fetcher=fetch}={}){
 if(await verified(file,asset))return;
 signal?.throwIfAborted();const temporary=file+'.part';let existing=0;
 try{const stat=await fs.lstat(temporary);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe partial model file.');existing=stat.size;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(existing>asset.bytes){await fs.rm(temporary);existing=0;}
 let hash=crypto.createHash('sha256');
 if(existing)for await(const chunk of createReadStream(temporary))hash.update(chunk);
 if(existing===asset.bytes){if(hash.digest('hex')!==asset.sha256){await fs.rm(temporary);throw Error('Model integrity check failed; retry the download.');}await fs.rename(temporary,file);return;}
 const idle=new AbortController();let timer;
 const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>idle.abort(),60000);timer.unref?.();};touch();
 const combined=AbortSignal.any([signal||new AbortController().signal,idle.signal,AbortSignal.timeout(30*60*1000)]);
 let handle,bytes=existing,integrityFailure=false;
 try{
  const response=await fetcher(url,{signal:combined,headers:existing?{Range:'bytes='+existing+'-'}:{}});
  if(!response.ok||!response.body){await response.body?.cancel();throw Error('Model publisher returned HTTP '+response.status+'. Retry to resume.');}
  if(existing&&response.status===206){
   const range=response.headers.get('content-range');if(range!=='bytes '+existing+'-'+(asset.bytes-1)+'/'+asset.bytes){await response.body.cancel();throw Error('Publisher returned an unexpected download range. Retry to resume.');}
  }else if(existing){existing=0;bytes=0;hash=crypto.createHash('sha256');}
  const length=response.headers.get('content-length');
  if(length&&Number(length)!==asset.bytes-existing){await response.body.cancel();throw Error('Model size differs from the pinned publisher file. Nothing was installed.');}
  handle=await fs.open(temporary,existing?'a':'w');progress(bytes,asset.bytes);
  for await(const chunk of response.body){
   combined.throwIfAborted();touch();bytes+=chunk.length;
   if(bytes>asset.bytes){integrityFailure=true;throw Error('Model exceeds its pinned size. Nothing was installed.');}
   hash.update(chunk);let offset=0;while(offset<chunk.length){const written=await handle.write(chunk,offset,chunk.length-offset);offset+=written.bytesWritten;}progress(bytes,asset.bytes);
  }
  if(bytes!==asset.bytes)throw Error('Model download was interrupted. Retry to resume.');
  if(hash.digest('hex')!==asset.sha256){integrityFailure=true;throw Error('Model integrity check failed. Retry the download.');}
  await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);
 }catch(error){
  if(error.code==='ENOSPC')throw Error('Not enough disk space for offline models. Free space, then retry to resume.');
  if(idle.signal.aborted)throw Error('The publisher stopped sending model data. Retry to resume the download.');throw error;
 }finally{clearTimeout(timer);await handle?.close().catch(()=>{});if(integrityFailure)await fs.rm(temporary,{force:true});}
}
module.exports={downloadAsset,verified};
