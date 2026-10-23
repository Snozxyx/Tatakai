'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const net=require('node:net');
const http=require('node:http');
const JSZip=require('jszip');
const runtime=require('./llama-runtime.json');

const contained=(root,file)=>{const relative=path.relative(root,file);return relative!== '..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function inventory(directory,base=directory){
    const files=[];
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
        if(entry.name==='installed.json')continue;const file=path.join(directory,entry.name);const name=path.relative(base,file);
        if(entry.isDirectory())files.push(...await inventory(file,base));
        else if(entry.isSymbolicLink()){const target=await fs.readlink(file);if(!contained(base,path.resolve(path.dirname(file),target)))throw Error('Runtime link escapes its directory');files.push({name,link:target});}
        else if(entry.isFile())files.push({name,sha256:digest(await fs.readFile(file))});
        else throw Error('Unsupported native runtime entry');
    }
    return files;
}
async function verify(directory){
    try{const installed=JSON.parse(await fs.readFile(path.join(directory,'installed.json'),'utf8'));
        if(installed.version!==runtime.version||!Array.isArray(installed.files)||!contained(directory,path.resolve(directory,installed.executable)))return null;
        for(const file of installed.files){const resolved=path.resolve(directory,file.name);if(!contained(directory,resolved))return null;
            if(file.link){if(await fs.readlink(resolved)!==file.link||!contained(directory,path.resolve(path.dirname(resolved),file.link)))return null;}
            else if(digest(await fs.readFile(resolved))!==file.sha256)return null;}
        return path.join(directory,installed.executable);
    }catch{return null;}
}
async function ensureRuntime(root,onProgress=()=>{},options={}){
    const platform=`${process.platform}-${process.arch}`;const asset=runtime.assets[platform];if(!asset)throw Error('No native model runtime is available for this architecture');
    await fs.mkdir(root,{recursive:true});const directory=path.join(root,`${runtime.version}-${platform}`);const existing=await verify(directory);if(existing)return existing;
    if(options.allowDownload===false)throw Error("The offline runtime is not installed. Download the offline models once while connected, then try again.");
    options.signal?.throwIfAborted();
    const staging=await fs.mkdtemp(path.join(root,'.install-'));
    try{
        onProgress('Downloading the verified local inference runtime…');
        const response=await fetch(`https://github.com/ggml-org/llama.cpp/releases/download/${runtime.version}/${asset.file}`,{signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(180000)])});
        if(!response.ok)throw Error(`Runtime publisher returned HTTP ${response.status}`);
        const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>512*1024*1024)throw Error('Runtime download exceeds its size limit');chunks.push(Buffer.from(chunk));}
        const bytes=Buffer.concat(chunks);if(digest(bytes)!==asset.sha256)throw Error('Native runtime integrity check failed. Nothing was installed.');
        onProgress('Installing the local inference runtime…');let total=0;
        if(asset.file.endsWith('.zip')){
            const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
            for(const entry of Object.values(zip.files)){
                const destination=path.resolve(staging,entry.name);if(!contained(staging,destination)||path.isAbsolute(entry.name)||entry.name.includes('\\'))throw Error('Unsafe runtime archive path');
                if(entry.dir){await fs.mkdir(destination,{recursive:true});continue;}
                const contents=await entry.async('nodebuffer');total+=contents.length;if(total>512*1024*1024)throw Error('Runtime expands beyond its size limit');
                await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,contents,{flag:'wx'});
            }
        }else{
            const archive=path.join(staging,'.runtime.tar.gz');await fs.writeFile(archive,bytes,{flag:'wx'});
            await require('./runtime-archive.cjs').extractRuntimeArchive(archive,staging);await fs.unlink(archive);
        }
        const files=await inventory(staging);const executable=files.find(file=>path.basename(file.name)===(process.platform==='win32'?'llama-server.exe':'llama-server'))?.name;
        if(!executable)throw Error('The downloaded runtime does not contain llama-server');
        if(process.platform!=='win32')await fs.chmod(path.join(staging,executable),0o755);
        await fs.writeFile(path.join(staging,'installed.json'),JSON.stringify({version:runtime.version,executable,files}),{flag:'wx'});
        // Preserve a damaged install for inspection and publish the verified replacement.
        if(!await verify(directory)){
            try{await fs.rename(directory,path.join(root,`.damaged-${runtime.version}-${platform}-${crypto.randomUUID()}`));}
            catch(error){if(error.code!=='ENOENT')throw error;}
        }
        try{await fs.rename(staging,directory);}catch(error){if(!await verify(directory))throw error;}
        return await verify(directory)||Promise.reject(Error('Installed runtime verification failed'));
    }finally{await fs.rm(staging,{recursive:true,force:true});}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function validateGguf(file){
    if(typeof file!=='string'||path.extname(file).toLowerCase()!=='.gguf')throw Error('Choose a GGUF model file');
    const handle=await fs.open(file,'r');
    try{const stat=await handle.stat();const header=Buffer.alloc(8);const {bytesRead}=await handle.read(header,0,8,0);
        if(!stat.isFile()||stat.size<24||bytesRead!==8||header.toString('ascii',0,4)!=='GGUF'||![2,3].includes(header.readUInt32LE(4)))throw Error('The selected file is not a supported GGUF model');
    }finally{await handle.close();}
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function health(port,key){return new Promise(resolve=>{const request=http.get({host:'127.0.0.1',port,path:'/health',headers:{Authorization:`Bearer ${key}`},timeout:1500},response=>{response.resume();resolve(response.statusCode===200);});request.on('error',()=>resolve(false));request.on('timeout',()=>{request.destroy();resolve(false);});});}
class LocalModel{
    constructor(root,onProgress){this.root=root;this.onProgress=onProgress;this.child=null;this.model=null;this.loading=false;this.connection=null;}
    status(){return {running:!!this.child,loading:this.loading,name:this.model,vision:!!this.connection?.vision};}
    async start(modelPath,projectionPath,options={}){
        options.signal?.throwIfAborted();
        if(this.loading)throw Error('A local model is already loading');if(this.child)throw Error('Stop the current local model before loading another');
        await validateGguf(modelPath);
        if(projectionPath)await validateGguf(projectionPath);
        this.loading=true;
        try{
            const binary=await ensureRuntime(this.root,this.onProgress,{allowDownload:!options.offline,signal:options.signal});const port=await freePort();const key=crypto.randomBytes(32).toString('hex');
            const args=['--model',modelPath,'--host','127.0.0.1','--port',String(port),'--ctx-size',options.offline?'8192':'4096','--batch-size','256','--ubatch-size','128','--parallel','1','--n-gpu-layers','0','--api-key',key,'--no-webui'];
            if(options.offline)args.push('--offline');
            if(projectionPath){if(path.extname(projectionPath).toLowerCase()!=='.gguf')throw Error('Vision projection must be a GGUF file');args.push('--mmproj',projectionPath);}
            this.onProgress('Loading the model on this device…');
            const child=spawn(binary,args,{cwd:path.dirname(binary),stdio:['ignore','ignore','pipe'],windowsHide:true,shell:false});this.child=child;
            child.stderr.resume();let failed=false;child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;if(this.child===child){this.child=null;this.model=null;this.connection=null;}});
            const deadline=Date.now()+180000;
            while(Date.now()<deadline){if(options.signal?.aborted)throw Error('Offline model loading was cancelled. Downloaded files were kept.');if(failed)throw Error('The local inference runtime stopped. Check model compatibility and available memory.');if(await health(port,key)){this.model=path.basename(modelPath);this.connection={endpoint:`http://127.0.0.1:${port}/v1`,model:this.model,key,vision:!!projectionPath};return this.connection;}await sleep(250);}
            throw Error('The local model did not become ready within three minutes');
        }catch(error){this.stop();throw error;}finally{this.loading=false;}
    }
    stop(){const child=this.child;this.child=null;this.model=null;this.connection=null;if(child)child.kill();}
}
module.exports={LocalModel,ensureRuntime,verify};
