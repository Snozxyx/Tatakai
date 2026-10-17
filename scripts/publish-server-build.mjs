// Durable fallback when the account's Actions artifact quota is exhausted.
// Only compiled server-release contents are archived; no runtime secrets.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=process.env.GITHUB_SHA,repo=process.env.GITHUB_REPOSITORY;
if(!/^[a-f0-9]{40}$/.test(sha||'')||!repo)throw new Error('Invalid build identity');
const manifest=JSON.parse(readFileSync('server-release/release.json','utf8'));
if(manifest.commit!==sha)throw new Error('Manifest commit mismatch');
const run=(cmd,args,optional=false)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0&&!optional)throw new Error(r.stderr||'Build publication failed');return r.status===0;};
run('python3',['-c',`import pathlib,zipfile
root=pathlib.Path('server-release')
with zipfile.ZipFile('server-release.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(root).as_posix())`]);
const receipt={...manifest,sha256:createHash('sha256').update(readFileSync('server-release.zip')).digest('hex'),runId:process.env.GITHUB_RUN_ID};
writeFileSync('server-release.sha256.json',JSON.stringify(receipt,null,2));
const tag=`server-build-${sha}`;
if(!run('gh',['release','view',tag,'--repo',repo],true))run('gh',['release','create',tag,'--repo',repo,'--draft','--prerelease','--target',sha,'--title',`${manifest.component} build ${sha.slice(0,7)}`,'--notes','Verified CI build archive. Deployment does not apply database migrations.']);
run('gh',['release','upload',tag,'--repo',repo,'--clobber','server-release.zip','server-release.sha256.json']);
run('gh',['release','edit',tag,'--repo',repo,'--draft=false','--prerelease']);
console.log('Durable build receipt:',receipt.sha256);
