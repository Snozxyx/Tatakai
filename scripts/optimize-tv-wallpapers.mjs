import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Dedicated derivatives keep shared desktop/mobile media untouched.
const root = fileURLToPath(new URL('../', import.meta.url));
const scenes = { sakura: 'bg-hero.mp4', crimson: '1.mp4', storm: '2.webm', flame: '3.mp4', neon: '5.mp4', ember: '6.mp4' };
const output = path.join(root, 'public/assets/tv/wallpapers');
mkdirSync(output, { recursive: true });
const manifest = [];
for (const [id, file] of Object.entries(scenes)) {
  const source = path.join(root, 'public/assets/video', file), target = path.join(output, `${id}.mp4`);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', source, '-an',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=12',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'medium',
    '-crf', '28', '-maxrate', '900k', '-bufsize', '1800k', '-threads', '2', '-filter_threads', '1', '-movflags', '+faststart', '-y', target], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`Failed to optimize ${id}`);
  manifest.push({ id, source: `/assets/video/${file}`, output: `/assets/tv/wallpapers/${id}.mp4`, sourceBytes: statSync(source).size, outputBytes: statSync(target).size, maxWidth: 1280, maxHeight: 720, fps: 12, audio: false, codec: 'H.264 Baseline' });
}
writeFileSync(path.join(output, 'media-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
