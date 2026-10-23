'use strict';
const {writePsdBuffer,initializeCanvas}=require('ag-psd');
const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');

// Every bitmap comes from the Rust renderer. No browser/canvas text redraw is used.
initializeCanvas(()=>{throw Error('PSD export requires native prepared image data');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
async function pixels(base64){
    const {data,info}=await sharp(Buffer.from(base64,'base64'),{limitInputPixels:100_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return {width:info.width,height:info.height,data:new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength)};
}
async function createPsd(prepared){
    const children=[{name:'Original artwork',imageData:await pixels(prepared.original),left:0,top:0,transparencyProtected:true}];
    for(const item of prepared.layers){
        const layer=item.layer;
        const child={name:layer.name,hidden:!layer.visible,opacity:layer.opacity,left:item.left,top:item.top,imageData:await pixels(item.png)};
        if(layer.kind==='text'){
            const style=layer.style;const radians=layer.rotation*Math.PI/180;const c=Math.cos(radians),s=Math.sin(radians);
            child.text={text:layer.translation,shapeType:'box',boxBounds:[0,0,layer.width,layer.height],orientation:'horizontal',
                transform:[c,s,-s,c,layer.x+layer.width/2-c*layer.width/2+s*layer.height/2,layer.y+layer.height/2-s*layer.width/2-c*layer.height/2],
                style:{font:{name:style.family==='sans-serif'?'ArialMT':style.family},fontSize:style.size,fauxBold:style.weight>=600,fauxItalic:style.italic,
                    fillColor:{r:style.fill[0],g:style.fill[1],b:style.fill[2]},fillFlag:true,strokeFlag:style.strokeWidth>0,
                    strokeColor:{r:style.stroke[0],g:style.stroke[1],b:style.stroke[2]},outlineWidth:style.strokeWidth,ligatures:true},
                paragraphStyle:{justification:style.align}};
        }
        children.push(child);
    }
    return writePsdBuffer({width:prepared.width,height:prepared.height,imageData:await pixels(prepared.merged),children:children.reverse()},{generateThumbnail:false,trimImageData:false});
}
function fileName(label,index){return `${String(index+1).padStart(4,'0')}_${String(label).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120).replace(/[. ]+$/g,'')||'page'}.psd`;}
async function exportPsd(engine,args){
    if(!Array.isArray(args.pageIds)||!args.pageIds.length||args.pageIds.length>2000)throw Error('Choose pages to export.');
    const manifestPath=path.join(args.path,'tatakai-translation.json');
    try{await fs.access(manifestPath);throw Error('An export manifest already exists. Choose an empty folder.');}catch(error){if(error.code!=='ENOENT')throw error;}
    const files=[];let metadata;
    for(const [index,pageId] of args.pageIds.entries()){
        const prepared=await engine.request('preparePsd',{revision:args.revision,pageId});
        const name=fileName(prepared.label,index);const handle=await fs.open(path.join(args.path,name),'wx');
        try{const bytes=await createPsd(prepared);await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
        metadata=prepared.metadata;files.push(name);
    }
    const handle=await fs.open(manifestPath,'wx');try{await handle.writeFile(JSON.stringify({...metadata,format:'psd',pages:args.pageIds,files},null,2));await handle.sync();}finally{await handle.close();}
    return {exported:true};
}
module.exports={createPsd,exportPsd};
