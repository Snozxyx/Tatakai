import type { CSSProperties } from 'react';

export type ProfilePalette = { ink:string; muted:string; primary:string; tonal:string; panel:string; background:string; border:string };
export const profilePalettes: Record<string,ProfilePalette> = {
  'sakura-letter':{ink:'#59474d',muted:'#80616e',primary:'#b94872',tonal:'#fce7ef',panel:'#fff7fa',background:'#fff7fa',border:'#f0d2df'},
  'cloud-notebook':{ink:'#4f5c77',muted:'#62728b',primary:'#626994',tonal:'#e5e8f6',panel:'#f3f7fb',background:'#edf3f6',border:'#dbe3ed'},
  'eyes-toward-heaven':{ink:'#263b52',muted:'#52667c',primary:'#365f80',tonal:'#d9e9f3',panel:'#f5f9fc',background:'#e5edf3',border:'#ccdbe6'},
  'komorebi':{ink:'#4a402f',muted:'#746751',primary:'#82612d',tonal:'#f2e6cb',panel:'#fffaf0',background:'#f8f3e8',border:'#e4d8bd'},
  'gothic-empress':{ink:'#f4e6e8',muted:'#c3aeb4',primary:'#ff9baa',tonal:'#482330',panel:'#1c151b',background:'#100d12',border:'#53303c'},
  'midnight-lofi':{ink:'#e9edf9',muted:'#aebbd6',primary:'#a9bfff',tonal:'#27324e',panel:'#171e31',background:'#101625',border:'#3b4868'},
  'uchiha':{ink:'#f5e8e8',muted:'#c8b1b1',primary:'#ff9696',tonal:'#472528',panel:'#1e171a',background:'#100d10',border:'#533236'},
  'sekaipop':{ink:'#543d70',muted:'#76618b',primary:'#78549b',tonal:'#eee1f7',panel:'#fffcf7',background:'#f1e7f6',border:'#d8c5e5'},
};
/** Fixed lightness levels keep text legible even for very pale/dark uploads. */
export function paletteFromSeed(seed:string):ProfilePalette {
  const hex=/^#[\da-f]{6}$/i.test(seed)?seed:'#668eae';
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;let h=210;
  if(delta){h=max===rgb[0]?((rgb[1]-rgb[2])/delta)%6:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;h=(h*60+360)%360;}
  const tone=(s:number,l:number)=>`hsl(${Math.round(h)} ${s}% ${l}%)`;
  return {ink:tone(22,19),muted:tone(16,36),primary:tone(34,34),tonal:tone(38,89),panel:tone(32,97),background:tone(30,93),border:tone(22,80)};
}
export function paletteStyles(p:ProfilePalette):CSSProperties {
 return Object.fromEntries(Object.entries(p).map(([key,value])=>[`--pt-${key}`,value])) as CSSProperties;
}
/** Quantized dominant color, sampled from the local upload; never sends it elsewhere. */
export async function imageSeed(file:File):Promise<string> {
 const image=await createImageBitmap(file);try {
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return '#668eae';
  ctx.drawImage(image,0,0,48,48);const {data}=ctx.getImageData(0,0,48,48);const bins=new Map<number,{n:number;r:number;g:number;b:number}>();
  for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;const r=data[i],g=data[i+1],b=data[i+2];const key=(r>>5)*64+(g>>5)*8+(b>>5);const v=bins.get(key)||{n:0,r:0,g:0,b:0};v.n++;v.r+=r;v.g+=g;v.b+=b;bins.set(key,v);}
  const v=[...bins.values()].sort((a,b)=>b.n-a.n)[0];return v?'#'+[v.r,v.g,v.b].map(n=>Math.round(n/v.n).toString(16).padStart(2,'0')).join(''):'#668eae';
 }finally{image.close();}
}
