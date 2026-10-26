import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { optimizedBackground, optimizedImageUrl, originalImageUrl } from '../src/lib/media/imageUrl';
import { mediaProps } from '../src/lib/media-jsx/props';
import { jsx } from '../src/lib/media-jsx/jsx-runtime';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

test('public database URLs are encoded once with compression, animation and cache settings', () => {
  const source = 'https://db.example.com/storage/v1/object/public/user-media/avatar.gif?v=2&name=a';
  const result = optimizedImageUrl(source, 128)!;
  const url = new URL(result);
  expect(url.origin).toBe('https://wsrv.nl');
  expect(url.searchParams.get('url')).toBe(source);
  expect(url.searchParams.get('w')).toBe('128');
  expect(url.searchParams.get('output')).toBe('webp');
  expect(url.searchParams.get('n')).toBe('-1');
  expect(url.searchParams.get('maxage')).toBe('7d');
  expect(optimizedImageUrl(result)).toBe(result);
});

test('private, signed, local, vector and video URLs bypass the shared CDN', () => {
  for (const value of [
    '/assets/logo.png', 'blob:https://tatakai.me/id', 'data:image/png;base64,AAA',
    'file:///tmp/image.png', 'http://127.0.0.1/image', 'http://10.0.0.1/image',
    'http://192.168.1.1/image', 'http://[::1]/image', 'https://device.local/image',
    'https://user:pass@cdn.example.com/a.png', 'https://cdn.example.com/a?X-Amz-Signature=secret',
    'https://db.example.com/storage/v1/object/sign/private/a.png?token=secret',
    'https://db.example.com/storage/v1/object/authenticated/a.png',
    'https://cdn.example.com/api/image?url=https://other.example.com/a.png',
    'https://cdn.example.com/a.svg', 'https://cdn.example.com/a.mp4',
  ]) expect(optimizedImageUrl(value)).toBe(value);
});

test('public web assets resolve against their actual deployed base URL', () => {
  globalThis.window = new JSDOM('', { url: 'https://tatakai.me/app/' }).window as unknown as Window & typeof globalThis;
  expect(new URL(optimizedImageUrl('../assets/a.png')!).searchParams.get('url')).toBe('https://tatakai.me/assets/a.png');
});

test('lightbox cache URLs preserve full resolution and recover sources from thumbnails', () => {
  const original = 'https://cdn.example.com/full.jpg?version=2';
  const thumbnail = optimizedImageUrl(original, 128)!;
  expect(originalImageUrl(thumbnail)).toBe(original);
  const full = new URL(optimizedImageUrl(originalImageUrl(thumbnail), null)!);
  expect(full.hostname).toBe('wsrv.nl');
  expect(full.searchParams.has('w')).toBe(false);
  expect(full.searchParams.has('h')).toBe(false);
  expect(full.searchParams.get('url')).toBe(original);
  expect(originalImageUrl('https://wsrv.nl/?url=javascript%3Aalert(1)')).toBe('https://wsrv.nl/?url=javascript%3Aalert(1)');
});

test('packaged compilation keeps relative assets offline even on the Capacitor HTTPS origin', async () => {
  globalThis.window = new JSDOM('', { url: 'https://tatakai.me/' }).window as unknown as Window & typeof globalThis;
  const compiled = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/lib/media/imageUrl.ts', import.meta.url))],
    bundle: true, format: 'esm', write: false,
    define: { 'import.meta.env.VITE_PACKAGED_BUILD': '"true"' },
  }).outputFiles[0].text;
  const native = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  expect(native.optimizedImageUrl('/assets/offline.png')).toBe('/assets/offline.png');
  expect(native.optimizedImageUrl('https://cdn.example.com/public.png')).toContain('https://wsrv.nl/');
});

test('runtime keeps refs and caller failover; retries original once, including prebuilt CDN URLs', () => {
  const original = 'https://cdn.example.com/cover.jpg';
  for (const source of [original, optimizedImageUrl(original)!]) {
    let errors = 0;
    const ref = { current: null };
    const props = mediaProps('img', { src: source, width: 100, ref, onError: () => errors++ })!;
    expect(props.ref).toBe(ref);
    const document = new JSDOM().window.document;
    const image = document.createElement('img');
    image.src = props.src;
    props.onError({ currentTarget: image });
    expect(image.src).toBe(original);
    expect(errors).toBe(0);
    props.onError({ currentTarget: image });
    expect(errors).toBe(1);
  }
  const element = jsx('img', { src: original, ref: { current: null } });
  expect(element.type).toBe('img');
  expect(element.props.src.startsWith('https://wsrv.nl/')).toBe(true);
});

test('posters and layered backgrounds optimize while playback, srcsets and reader originals stay intact', () => {
  const video = mediaProps('video', { src: 'https://cdn.example.com/a.mp4', poster: 'https://cdn.example.com/a.jpg' })!;
  expect(video.src).toBe('https://cdn.example.com/a.mp4');
  expect(video.poster).toContain('https://wsrv.nl/');
  const background = 'linear-gradient(black, transparent), url("https://cdn.example.com/bg.jpg")';
  expect(optimizedBackground(background)).toContain('linear-gradient(black, transparent), url("https://wsrv.nl/');
  expect(optimizedBackground('url("data:image/svg+xml,a")')).toBe('url("data:image/svg+xml,a")');
  const props = { src: 'https://cdn.example.com/page.jpg', 'data-image-original': true };
  expect(mediaProps('img', props)).toBe(props);
  const responsive = { src: 'https://cdn.example.com/a.jpg', srcSet: 'https://cdn.example.com/a.jpg 1x' };
  expect(mediaProps('img', responsive)).toBe(responsive);
});
