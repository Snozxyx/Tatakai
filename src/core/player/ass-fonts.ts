export const ASS_FONTS_UPDATED = 'tatakai-ass-fonts-updated';
const fonts: string[] = [];
export function getAssFonts(): string[] { return [...fonts]; }
export async function importAssFonts(files: FileList | File[]) {
  if (fonts.length + files.length > 32) throw new Error('You can load up to 32 subtitle fonts.');
  const imported: string[] = [];
  for (const file of Array.from(files)) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name) || file.size > 8*1024*1024) throw new Error('Choose TTF, OTF, WOFF or WOFF2 fonts smaller than 8 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = String.fromCharCode(...bytes.slice(0,4));
    if (!(bytes[0] === 0 && bytes[1] === 1) && !['OTTO','ttcf','wOFF','wOF2'].includes(signature)) throw new Error('This file is not a supported font.');
    const data = await new Promise<string>((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The font could not be read.'));reader.readAsDataURL(new Blob([bytes],{type:'font/ttf'})); });
    imported.push(data);
  }
  fonts.push(...imported); window.dispatchEvent(new Event(ASS_FONTS_UPDATED));
  return imported.length;
}
