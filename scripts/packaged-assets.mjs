import { cpSync } from 'node:fs';
import path from 'node:path';

// Vite otherwise copies all public files, including website demo recordings.
export function packagedAssetsPlugin() {
  let root;
  let output;
  return {
    name: 'tatakai-packaged-assets',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      output = path.resolve(root, config.build.outDir);
    },
    closeBundle() {
      const source = path.join(root, 'public');
      cpSync(source, output, {
        recursive: true,
        filter(file) {
          const relative = path.relative(source, file).split(path.sep).join('/');
          return !['assets/brand', 'assets/video', 'altstore'].some(dir =>
            relative === dir || relative.startsWith(`${dir}/`)) && relative !== 'sw.js' && relative !== 'assets/profile-themes/uchiha/itachi-rain-4k.mp4';
        },
      });
    },
  };
}
