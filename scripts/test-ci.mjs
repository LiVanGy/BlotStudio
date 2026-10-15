import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// The static examples bundle is not part of this public preview. Do not claim its tests ran in CI.
const pendingExamples=new Set(['app-regressions.test.cjs','imagej.test.cjs','imagej-ui.test.cjs']);
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.cjs')&&!pendingExamples.has(f)).map(f=>'tests/'+f);
for(const f of readdirSync('native/tests').filter(f=>f.endsWith('.test.cjs')))tests.push('native/tests/'+f);
console.log('CI subset: static-example-dependent tests are pending publication:',[...pendingExamples].join(', '));
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});
process.exit(result.status??1);
