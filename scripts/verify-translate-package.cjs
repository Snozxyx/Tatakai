'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
function binaryTarget(bytes){
  if(bytes.length>=64&&bytes[0]===0x4d&&bytes[1]===0x5a){
    const offset=bytes.readUInt32LE(60);
    if(offset+6<=bytes.length&&bytes.toString('ascii',offset,offset+4)==='PE\0\0'){
      const machine=bytes.readUInt16LE(offset+4);
      return machine===0x8664?'win32-x64':machine===0xaa64?'win32-arm64':null;
    }
  }
  if(bytes.length>=20&&bytes.toString('hex',0,4)==='7f454c46'&&bytes[4]===2&&bytes[5]===1){
    const machine=bytes.readUInt16LE(18);
    return machine===62?'linux-x64':machine===183?'linux-arm64':null;
  }
  if(bytes.length>=8&&bytes.readUInt32LE(0)===0xfeedfacf){
    const cpu=bytes.readUInt32LE(4);
    return cpu===0x01000007?'darwin-x64':cpu===0x0100000c?'darwin-arm64':null;
  }
  return null;
}
async function verifyTranslationPackage(context){
  const arch=typeof context.arch==='string'?context.arch:({1:'x64',3:'arm64'})[context.arch];
  const platform=context.electronPlatformName;
  if(!['x64','arm64'].includes(arch)||!['win32','darwin','linux'].includes(platform))throw Error('Yomi requires a separate x64 or ARM64 desktop package.');
  const resources=platform==='darwin'?path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`,'Contents','Resources'):path.join(context.appOutDir,'resources');
  const file=path.join(resources,'bin','translate-engine',arch,platform==='win32'?'tatakai-translate.exe':'tatakai-translate');
  let handle;
  try{
    handle=await fs.open(file,'r');const bytes=Buffer.alloc(65536);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
    const actual=binaryTarget(bytes.subarray(0,bytesRead));
    if(actual!==`${platform}-${arch}`)throw Error(`Translation engine architecture mismatch: expected ${platform}-${arch}, found ${actual||'unknown format'}`);
    if(platform!=='win32'){const stat=await handle.stat();if(!(stat.mode&0o111))throw Error('Packaged translation engine is not executable');}
  }catch(error){if(error.code==='ENOENT')throw Error(`Packaged translation engine is missing for ${platform}/${arch}. Build that native target before packaging.`);throw error;}
  finally{await handle?.close();}
}
module.exports=verifyTranslationPackage;
module.exports.binaryTarget=binaryTarget;
