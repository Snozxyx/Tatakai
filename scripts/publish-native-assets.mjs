// Tagged releases use their own draft assets rather than duplicate multi-GB
// installers in Actions artifact storage. The final job publishes the draft.
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const tag=process.env.GITHUB_REF_NAME,repo=process.env.GITHUB_REPOSITORY;
const version=JSON.parse(readFileSync('package.json','utf8')).version;
if(tag!==`v${version}`||!repo) throw new Error('Release identity does not match package version');
const gh=(args,optional=false)=>{const r=spawnSync('gh',args,{encoding:'utf8'});if(r.status!==0&&!optional)throw new Error(r.stderr||'GitHub release operation failed');return r.status===0;};
if(!gh(['release','view',tag,'--repo',repo],true)){
 const dir=mkdtempSync(join(tmpdir(),'tatakai-release-'));
 try{
  const notes=join(dir,'notes.md');
  const changelog=readFileSync('CHANGELOG.md','utf8');
  const start=changelog.indexOf(`## [${version}]`),end=changelog.indexOf('\n## [',start+1);
  if(start<0)throw new Error('Release changelog missing');
  writeFileSync(notes,changelog.slice(start,end<0?undefined:end));
  if(!gh(['release','create',tag,'--repo',repo,'--draft','--target',process.env.GITHUB_SHA,'--title',`Tatakai ${version}`,'--notes-file',notes],true))gh(['release','view',tag,'--repo',repo]);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const component=process.argv[2];
const files=component==='desktop'
 ?readdirSync('dist_electron').filter(n=>/\.(exe|dmg|zip|AppImage|deb|yml|blockmap)$/.test(n)).map(n=>'dist_electron/'+n)
 :readdirSync('.').filter(n=>n.startsWith(`Tatakai-v${version}-`)&&(component==='android'?/-android(?:-tv)?\.apk$/.test(n):/-ios-unsigned\.ipa$/.test(n)));
if(!files.length)throw new Error('No native release files');
gh(['release','upload',tag,'--repo',repo,'--clobber',...files]);
