import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function nativeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(version);
  if (!match) throw new Error('Expected X.Y.Z or X.Y.Z-beta.N');
  const [, majorText, minorText, patchText, betaText] = match;
  const [major, minor, patch] = [majorText, minorText, patchText].map(Number);
  const channel = betaText ? Number(betaText) : 99;
  if (minor > 99 || patch > 99 || channel < 1 || channel > 99 || (betaText && channel > 98)) throw new Error('Native version field out of range');
  const androidCode = major * 1000000 + minor * 10000 + patch * 100 + channel;
  if (androidCode > 2100000000) throw new Error('Android versionCode exceeds its limit');
  return { androidCode, marketing: `${major}.${minor}.${patch}`, iosBuild: `${major}.${minor}.${patch * 100 + channel}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const values = nativeVersion(version);
  const gradle = path.join(root, 'android/app/build.gradle');
  writeFileSync(gradle, readFileSync(gradle, 'utf8').replace(/versionCode\s*=\s*\d+/, `versionCode = ${values.androidCode}`).replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${version}"`));
  const project = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  writeFileSync(project, readFileSync(project, 'utf8').replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${values.iosBuild};`).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${values.marketing};`));
  console.log(JSON.stringify({ version, ...values }));
}
