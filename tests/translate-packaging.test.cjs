const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const verify=require('../scripts/verify-translate-package.cjs');
const runtime=require('../desktop/runtime/translate/llama-runtime.json');
function header(platform,arch){
  const bytes=Buffer.alloc(256);
  if(platform==='win32'){bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128,'ascii');bytes.writeUInt16LE(arch==='x64'?0x8664:0xaa64,132);}
  else if(platform==='linux'){bytes.write('7f454c46','hex');bytes[4]=2;bytes[5]=1;bytes.writeUInt16LE(arch==='x64'?62:183,18);}
  else {bytes.writeUInt32LE(0xfeedfacf);bytes.writeUInt32LE(arch==='x64'?0x01000007:0x0100000c,4);}
  return bytes;
}
test('all six desktop engine formats and CPU runtime manifests match their target',()=>{
  for(const platform of ['win32','linux','darwin'])for(const arch of ['x64','arm64']){
    assert.equal(verify.binaryTarget(header(platform,arch)),`${platform}-${arch}`);
    assert.match(runtime.assets[`${platform}-${arch}`].sha256,/^[a-f0-9]{64}$/);
  }
  assert.equal(verify.binaryTarget(Buffer.alloc(3)),null);
});
test('packaging rejects a missing engine or an engine for another desktop target',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tatakai-package-'));
  try{
    const context={arch:1,electronPlatformName:'win32',appOutDir:root};
    await assert.rejects(verify(context),/missing/);
    const file=path.join(root,'resources/bin/translate-engine/x64/tatakai-translate.exe');await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,header('linux','x64'));await assert.rejects(verify(context),/architecture mismatch/);
    await fs.writeFile(file,header('win32','x64'));await verify(context);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

const {extractRuntimeArchive}=require('../desktop/runtime/translate/runtime-archive.cjs');
const zlib=require('node:zlib');
const {Header}=require('tar');
function archiveBytes(entries) {
  const chunks=[];
  for (const entry of entries) {
    const data=Buffer.from(entry.data||'');
    const header=new Header({path:entry.name,type:entry.type||'File',size:data.length,mode:0o755,linkpath:entry.target});header.encode();
    chunks.push(header.block,data,Buffer.alloc((512-data.length%512)%512));
  }
  chunks.push(Buffer.alloc(1024));return zlib.gzipSync(Buffer.concat(chunks));
}
test('runtime archives resolve forward library links without extracting through symlinks',{skip:process.platform==='win32'},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tatakai-runtime-links-'));
  try {
    const archive=path.join(root,'runtime.tar.gz');
    await fs.writeFile(archive,archiveBytes([{name:'lib.so',type:'SymbolicLink',target:'lib.so.0'},{name:'lib.so.0',type:'SymbolicLink',target:'lib.so.0.1'},{name:'lib.so.0.1',data:'library'}]));
    await extractRuntimeArchive(archive,root);
    assert.equal(await fs.readFile(path.join(root,'lib.so'),'utf8'),'library');
    assert.equal(await fs.realpath(path.join(root,'lib.so')),path.join(await fs.realpath(root),'lib.so.0.1'));
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('runtime archives reject escaping paths, links, cycles and oversized content',async()=>{
  for (const [entries,limit] of [
    [[{name:'../outside',data:'bad'}],512],
    [[{name:'unsafe',type:'SymbolicLink',target:'../outside'}],512],
    [[{name:'a',type:'SymbolicLink',target:'b'},{name:'b',type:'SymbolicLink',target:'a'}],512],
    [[{name:'large',data:'too long'}],2],
  ]) {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'tatakai-runtime-unsafe-'));
    try {const archive=path.join(root,'runtime.tar.gz');await fs.writeFile(archive,archiveBytes(entries));await assert.rejects(extractRuntimeArchive(archive,root,limit),/Unsafe|cyclic|size limit/);}
    finally {await fs.rm(root,{recursive:true,force:true});}
  }
});
