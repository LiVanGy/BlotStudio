import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'blotstudio-synthetic-tests-'));
const env={...process.env,BLOTSTUDIO_EXAMPLE_DIR:directory};
const run=(command,args)=>{const result=spawnSync(command,args,{env,stdio:'inherit'});if(result.status!==0)throw Error(command+' exited '+result.status);};
try{
  run(process.env.BLOTSTUDIO_PYTHON||'python3',['tests/generate-workflow-fixtures.py']);
  run(process.execPath,['scripts/generate-test-project.cjs']);
  const tests=fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/'+f);
  tests.push(...fs.readdirSync('native/tests').filter(f=>f.endsWith('.test.cjs')).map(f=>'native/tests/'+f));
  run(process.execPath,['--test',...tests]);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{fs.rmSync(directory,{recursive:true,force:true});}
