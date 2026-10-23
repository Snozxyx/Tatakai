import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const roots = ['shared/aniyomi/java', 'desktop/runtime/compatibility/aniyomi-java'];
async function files(directory) { const entries = await fs.readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat(); }
const sources = (await Promise.all(roots.map(files))).flat().filter(file => file.endsWith('.java')).sort();
const output = path.resolve('.cache/extension-feasibility/aniyomi-classes'); await fs.mkdir(output, { recursive: true });
execFileSync('javac', ['--release', '17', '-encoding', 'UTF-8', '-cp', path.resolve('.cache/extension-feasibility/aniyomi-runtime/aniyomiDesktop-plugin.jar'), '-d', output, ...sources], { stdio: 'inherit' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const result = { sources: {}, classes: {} };
for (const file of sources) result.sources[file.replaceAll('\\', '/')] = hash((await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n'));
for (const file of await files(output)) if (file.endsWith('.class')) { const bytes = await fs.readFile(file); result.classes[path.relative(output, file).replaceAll('\\', '/')] = { sha256: hash(bytes), data: bytes.toString('base64') }; }
await fs.writeFile('desktop/runtime/compatibility/aniyomi-compiled.json', JSON.stringify(result, null, 2) + '\n');
await fs.mkdir('android/app/src/main/assets', { recursive: true });
await fs.copyFile('desktop/runtime/compatibility/aniyomi-artifacts.json', 'android/app/src/main/assets/aniyomi-runtime.json');
console.log(`Compiled ${sources.length} original Tatakai host files`);
