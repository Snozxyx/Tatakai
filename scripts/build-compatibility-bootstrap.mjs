// Reproducibly compile our small bridge, not third-party extensions. Java 17+ required.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const source = path.resolve('desktop/runtime/compatibility/bootstrap/SuwayomiBootstrap.java');
const output = path.resolve('.cache/extension-feasibility/bootstrap-classes');
await fs.mkdir(output, { recursive: true });
const hostJar = process.env.COMPATIBILITY_HOST_JAR || path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64/bin/Suwayomi-Server.jar');
const result = spawnSync('javac', ['--release', '17', '-encoding', 'UTF-8', '-cp', hostJar, '-d', output, source], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) throw Error('Could not compile local bootstrap');
const bytes = await fs.readFile(path.join(output, 'app/tatakai/compatibility/SuwayomiBootstrap.class'));
const sha = value => createHash('sha256').update(value).digest('hex');
await fs.writeFile('desktop/runtime/compatibility/bootstrap/compiled.json', JSON.stringify({ sourceSha256: sha((await fs.readFile(source, 'utf8')).replace(/\r\n/g, '\n')), sha256: sha(bytes), base64: bytes.toString('base64') }, null, 2) + '\n');
console.log(`Compiled fixed-operation bootstrap: ${bytes.length} bytes`);
