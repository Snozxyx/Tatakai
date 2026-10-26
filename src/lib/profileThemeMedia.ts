import DOMPurify from 'dompurify';
import { validateProfileImage } from './profileMedia';

/** SVGs are rasterized before upload; uploaded SVG markup is never served or inserted. */
export async function prepareProfileThemeImage(file: File): Promise<File> {
  if (file.type !== 'image/svg+xml' && !/\.svg$/i.test(file.name)) { validateProfileImage(file); return file; }
  if (file.size > 8 * 1024 * 1024) throw new Error('Image must be 8MB or smaller.');
  const safe = DOMPurify.sanitize(await file.text(), { USE_PROFILES: { svg: true }, FORBID_TAGS: ['foreignObject', 'image', 'use', 'style', 'script', 'animate', 'animateTransform', 'set'], FORBID_ATTR: ['href', 'xlink:href', 'style'] });
  const document = new DOMParser().parseFromString(safe, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error('This SVG could not be read. Try a PNG, JPEG, or WebP image.');
  const viewBox = (document.documentElement.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const candidateAspect = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox[2] / viewBox[3] : 16 / 9;
  const aspect = Number.isFinite(candidateAspect) ? Math.max(0.125, Math.min(8, candidateAspect)) : 16 / 9;
  const rasterWidth = Math.min(2560, Math.max(1, 1440 * aspect));
  document.documentElement.setAttribute('width', String(Math.round(rasterWidth)));
  document.documentElement.setAttribute('height', String(Math.max(1, Math.round(rasterWidth / aspect))));
  const image = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(document)], { type: 'image/svg+xml' }));
  try {
    image.src = url; await image.decode();
    const scale = Math.min(1, 2560 / Math.max(image.naturalWidth || 1920, image.naturalHeight || 1080));
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1920) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1080) * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image conversion is unavailable. Choose a PNG or JPEG instead.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not convert this SVG.')), 'image/png'));
    return new File([blob], file.name.replace(/\.svg$/i, '') + '.png', { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}
