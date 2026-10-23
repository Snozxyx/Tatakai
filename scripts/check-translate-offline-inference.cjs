'use strict';
// Cached tiny-model execution smoke. This is not a translation quality test.
const path=require('node:path');
const http=require('node:http');
const {LocalModel}=require('../desktop/runtime/translate/local-model.cjs');
async function main(){
 const root=path.resolve('.cache/translate-real-model');const originalFetch=global.fetch;
 global.fetch=()=>{throw Error('Offline smoke forbids external downloads');};
 const model=new LocalModel(path.join(root,'runtime'),message=>console.log(message));
 try{
  const connection=await model.start(path.join(root,'stories15M-q4_0.gguf'),null,{offline:true});
  const url=new URL(connection.endpoint);let output='';
  const result=await new Promise((resolve,reject)=>{
   const request=http.request({hostname:'127.0.0.1',port:url.port,path:'/completion',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.key},timeout:60000},response=>{response.on('data',chunk=>output+=chunk);response.on('end',()=>response.statusCode===200?resolve(JSON.parse(output)):reject(Error('Local inference failed: '+response.statusCode)));});
   request.on('error',reject);request.on('timeout',()=>request.destroy(Error('Local inference timed out')));request.end(JSON.stringify({prompt:'Once upon a time',n_predict:8,temperature:0,seed:1}));
  });
  if(!result.content?.trim())throw Error('No generated text');
  console.log('Real CPU inference passed with downloads forbidden and runtime --offline enabled.');
 }finally{model.stop();global.fetch=originalFetch;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
