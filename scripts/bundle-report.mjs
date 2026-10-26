import fs from 'node:fs';
import path from 'node:path';
const directory = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'dist';
function size(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const file = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? size(file) : fs.statSync(file).size);
  }, 0);
}
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const startup = [...new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"\s]+\.js)"/g)].map(match => match[1]))];
const report = { directory, totalBytes: size(directory), publicBytes: size('public'),
  startupBytes: startup.reduce((total, file) => total + fs.statSync(path.join(directory, file)).size, 0), startup };
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--check-native')) {
  const forbidden = ['assets/brand', 'assets/video', 'sw.js', 'altstore'];
  const presentForbidden = forbidden.filter(file => fs.existsSync(path.join(directory, file)));
  const totalLimit = 140 * 1024 * 1024;
  const startupLimit = 6 * 1024 * 1024;
  const reasons = [];
  if (presentForbidden.length) reasons.push(`forbidden files present: ${presentForbidden.join(', ')}`);
  if (report.totalBytes > totalLimit) reasons.push(`totalBytes (${(report.totalBytes / (1024 * 1024)).toFixed(2)} MB) exceeded budget (${totalLimit / (1024 * 1024)} MB)`);
  if (report.startupBytes > startupLimit) reasons.push(`startupBytes (${(report.startupBytes / (1024 * 1024)).toFixed(2)} MB) exceeded budget (${startupLimit / (1024 * 1024)} MB)`);
  if (reasons.length) {
    throw new Error(`Native asset/startup budget exceeded (${reasons.join('; ')}). Inspect the bundle before packaging.`);
  }
}
