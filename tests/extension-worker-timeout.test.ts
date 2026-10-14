import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

test("healthy worker calls survive two minutes of accumulated time; stuck calls still terminate and recover", () => {
  const script = `const {ExtensionWorkerPool}=require('./desktop/runtime/extension/extension-worker-pool.cjs');
 (async()=>{
  let suspensions=0;const pool=new ExtensionWorkerPool(null,{onSuspend:()=>suspensions++});
  const code="module.exports={ping:()=> 'ok',hang:()=>new Promise(()=>{})}";
  try{
   await pool.getOrSpawn('timeout-fixture',code,{permissions:[]});
   await pool.invoke('timeout-fixture','ping',[]);
   pool._workers.get('timeout-fixture').cumulativeMs=125000;
   for(let i=0;i<3;i++)if(await pool.invoke('timeout-fixture','ping',[])!=='ok')throw Error('Healthy call rejected');
   pool._workers.get('timeout-fixture').callTimeoutMs=30;
   let timedOut=false;
   try{await pool.invoke('timeout-fixture','hang',[])}catch(e){timedOut=/timed out/.test(e.message)}
   if(!timedOut||pool._workers.has('timeout-fixture'))throw Error('Stuck worker was not terminated');
   await pool.getOrSpawn('timeout-fixture',code,{permissions:[]});
   if(await pool.invoke('timeout-fixture','ping',[])!=='ok'||suspensions!==0)throw Error('Recovery failed');
   console.log('RESULT:ok');
  }finally{pool.terminateAll()}
 })().catch(e=>{console.error(e);process.exitCode=1});`;
  const result = execFileSync("node", ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15000,
  });
  expect(result).toContain("RESULT:ok");
}, 20000);
