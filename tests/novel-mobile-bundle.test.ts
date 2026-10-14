import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('packaged novel providers run in the isolated mobile host',()=>{
 const result=spawnSync(process.execPath,['test','scripts/novel-mobile-bundle.test.ts'],{cwd:process.cwd(),encoding:'utf8',timeout:30000});
 if(result.status!==0)throw new Error(result.stderr||result.stdout||String(result.error));
 expect(result.status).toBe(0);
},35000);
