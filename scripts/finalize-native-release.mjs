import { readFileSync, existsSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function selectCanonicalRelease(releases, required) {
  const complete = releases.filter(r => required.every(name => r.assets.some(a => a.name === name && a.size > 0)));
  if (complete.length !== 1) throw new Error('Expected exactly one release with all completed native packages');
  const canonical = complete[0];
  const duplicates = releases.filter(r => r.id !== canonical.id);
  if (duplicates.some(r => r.assets.length)) throw new Error('Another release has assets; refusing to delete or overwrite it');
  return { canonical, duplicates };
}

export async function finalize() {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
  const runId = process.env.RELEASE_BUILD_RUN_ID || process.env.GITHUB_RUN_ID;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(tag || '') || !/^\d+$/.test(runId || '')) throw new Error('Explicit repository, release tag and build run are required');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || spawnSync('gh', ['auth','token'], {encoding:'utf8'}).stdout.trim();
  if (!token) throw new Error('GitHub authentication missing');
  const base = `https://api.github.com/repos/${repo}`;
  const request = async (url, options = {}, raw = false) => {
    const r = await fetch(url.startsWith('https:') ? url : base + url, { ...options, headers: {Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',...options.headers}, signal:AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`GitHub ${options.method || 'GET'} failed (${r.status}): ${(await r.text()).slice(0,400)}`);
    return raw ? new Uint8Array(await r.arrayBuffer()) : r.status === 204 ? null : r.json();
  };
  const ref = await request(`/git/ref/tags/${encodeURIComponent(tag)}`);
  const sha = ref.object.type === 'tag' ? (await request(`/git/tags/${ref.object.sha}`)).object.sha : ref.object.sha;
  const run = await request(`/actions/runs/${runId}`);
  if (run.head_sha !== sha || run.path !== '.github/workflows/build.yml') throw new Error('Build run does not match the immutable release tag');
  const jobs = [];
  for (let page=1;page<=10;page++) { const data=await request(`/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`);jobs.push(...data.jobs);if(data.jobs.length<100)break; }
  const platforms=['quality-gates','build-android','build-ios-unsigned','build-desktop (windows-latest, win)','build-desktop (macos-latest, mac)','build-desktop (ubuntu-latest, linux)'];
  if (platforms.some(name => jobs.filter(job=>job.name===name).sort((a,b)=>(b.run_attempt||0)-(a.run_attempt||0)||Date.parse(b.started_at)-Date.parse(a.started_at))[0]?.conclusion!=='success')) throw new Error('Every platform build must pass before publishing');
  const version=tag.slice(1), prefix=`Tatakai-${version}`;
  const required=[`${prefix}-win-x64.exe`,`${prefix}-win-x64-portable.exe`,`${prefix}-linux-x86_64.AppImage`,`${prefix}-linux-amd64.deb`,...['arm64','x64'].flatMap(arch=>[`${prefix}-mac-${arch}.dmg`,`${prefix}-mac-${arch}.zip`]),`Tatakai-v${version}-android.apk`,`Tatakai-v${version}-android-tv.apk`,`Tatakai-v${version}-ios-unsigned.ipa`];
  const releases=[];
  for(let page=1;page<=10;page++){const data=await request(`/releases?per_page=100&page=${page}`);releases.push(...data.filter(r=>r.tag_name===tag));if(data.length<100)break;}
  const {canonical,duplicates}=selectCanonicalRelease(releases,required);
  if (canonical.target_commitish !== sha) throw new Error('Package release source does not match the tag');
  const inventory=new Map(canonical.assets.map(a=>[a.name,a]));
  const upload=async(name,bytes,type)=>{
    const prior=inventory.get(name);if(prior)await request(`/releases/assets/${prior.id}`,{method:'DELETE'});
    const asset=await request(`https://uploads.github.com/repos/${repo}/releases/${canonical.id}/assets?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':type},body:bytes});inventory.set(name,asset);
  };
  const download=asset=>request(`/releases/assets/${asset.id}`,{headers:{Accept:'application/octet-stream'}},true);
  // Older builders may emit latest*.yml even for prereleases. Publish explicit
  // beta aliases with the same checksummed package URLs, never rename binaries.
  for(const suffix of ['', '-mac', '-linux']){
    const target=`${version.includes('-beta.')?'beta':'latest'}${suffix}.yml`;
    const source=inventory.get(target)||inventory.get(`latest${suffix}.yml`);
    if(!source)throw new Error(`Update manifest missing: ${target}`);
    const bytes=await download(source),text=new TextDecoder().decode(bytes);
    if(!new RegExp(`^version:\\s*["']?${version.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']?\\s*$`,'m').test(text))throw new Error(`Update manifest version mismatch: ${source.name}`);
    for(const match of text.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*["']?([^\r\n"']+)/gm))if(!inventory.has(decodeURIComponent(match[1].trim())))throw new Error('Update manifest references a missing package');
    if(!inventory.has(target))await upload(target,bytes,'application/yaml');
  }
  const altstore=process.argv[2]||'altstore-apps.json';
  if(existsSync(altstore))await upload('altstore-apps.json',readFileSync(altstore),'application/json');
  else if(JSON.parse(readFileSync('package.json','utf8')).version===version){
    const dir=mkdtempSync(join(tmpdir(),'tatakai-altstore-')),output=join(dir,'apps.json');
    try {
      const ipa=inventory.get(`Tatakai-v${version}-ios-unsigned.ipa`);
      const generated=spawnSync(process.execPath,['scripts/generate-altstore-source.mjs','--out',output,'--size',String(ipa.size),'--versionDate',ipa.updated_at],{encoding:'utf8'});
      if(generated.status!==0)throw new Error('AltStore metadata generation failed');
      await upload('altstore-apps.json',readFileSync(output),'application/json');
    }finally{if(existsSync(output))unlinkSync(output);rmdirSync(dir);}
  }
  if(!inventory.has('altstore-apps.json'))throw new Error('AltStore source missing');
  // Delete only empty duplicate metadata. Git tags and native assets are retained.
  for(const duplicate of duplicates){const latest=await request(`/releases/${duplicate.id}`);if(latest.tag_name!==tag||latest.assets.length)throw new Error('Duplicate changed; refusing cleanup');await request(`/releases/${duplicate.id}`,{method:'DELETE'});}
  const body=canonical.body?.includes('## Downloads')?canonical.body:(canonical.body||'')+'\n\n## Downloads\n\nWindows: installer or portable EXE. macOS: choose the arm64 or x64 DMG/ZIP. Linux: AppImage or DEB. Android phone and Android TV have separate APKs. The iOS IPA requires sideload signing.\n\n'+(version.includes('-beta.')?'Beta channel release; the current production release remains unchanged.':'Production release.');
  const result=await request(`/releases/${canonical.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,draft:false,prerelease:version.includes('-beta.'),target_commitish:sha,make_latest:version.includes('-beta.')?'false':'true'})});
  if(result.draft||result.prerelease!==version.includes('-beta.')||required.some(name=>!result.assets.some(a=>a.name===name)))throw new Error('Publication verification failed');
  console.log(JSON.stringify({releaseId:result.id,url:result.html_url,draft:result.draft,prerelease:result.prerelease,assets:result.assets.length}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)finalize().catch(error=>{console.error(error.message);process.exitCode=1;});
