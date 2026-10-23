'use strict';
// Opt-in real CPU inference check. This tiny story model tests execution only,
// not translation quality. Model and runtime are obtained from their publishers.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {LocalModel}=require('../desktop/runtime/translate/local-model.cjs');
const sha256='66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
    const root=path.resolve('.cache/translate-real-model');await fs.mkdir(root,{recursive:true});
    const file=path.join(root,'stories15M-q4_0.gguf');
    let bytes=await fs.readFile(file).catch(()=>null);
    if(!bytes||digest(bytes)!==sha256){
        const response=await fetch('https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories15M-q4_0.gguf',{signal:AbortSignal.timeout(120000)});
        if(!response.ok)throw Error(`Model publisher returned HTTP ${response.status}`);
        const chunks=[];let total=0;
        for await(const chunk of response.body){total+=chunk.length;if(total>20*1024*1024)throw Error('Smoke model exceeds size limit');chunks.push(Buffer.from(chunk));}
        bytes=Buffer.concat(chunks);if(digest(bytes)!==sha256)throw Error('Smoke model integrity check failed');
        await fs.writeFile(file,bytes);
    }
    const model=new LocalModel(path.join(root,'runtime'),message=>process.stdout.write(`${message}\n`));
    try{
        const connection=await model.start(file);
        const response=await fetch(`${connection.endpoint.slice(0,-3)}/completion`,{
            method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.key}`},
            body:JSON.stringify({prompt:'Once upon a time',n_predict:16,temperature:0,seed:1}),signal:AbortSignal.timeout(60000),
        });
        if(!response.ok)throw Error(`Inference returned HTTP ${response.status}`);
        const result=await response.json();
        if(typeof result.content!=='string'||!result.content.trim()||result.tokens_predicted<1)throw Error('The model produced no tokens');
        process.stdout.write(JSON.stringify({platform:process.platform,arch:process.arch,model:path.basename(file),tokens:result.tokens_predicted,text:result.content})+'\n');
    }finally{model.stop();}
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
