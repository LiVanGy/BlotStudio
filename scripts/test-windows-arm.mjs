import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

assert.equal(process.platform, 'win32');
const executable = path.resolve(process.argv[2]);
const temporary = await mkdtemp(path.join(tmpdir(), 'BlotStudio ARM QA '));
const qaInstall = path.join(temporary, 'test app');
const qaExe = path.join(qaInstall, path.basename(executable));
const qaHtml = path.join(qaInstall, 'www', 'BlotStudio.html');
const original = await readFile(path.join(path.dirname(executable), 'www', 'BlotStudio.html'), 'utf8');
const fixture = await readFile('tests/fixtures/native16-raw.tif');
const hash = 'sha256:' + createHash('sha256').update(fixture).digest('hex');
let app;

async function nativeCase(exe, profile, mode) {
  const env = {...process.env, WEBVIEW2_USER_DATA_FOLDER: profile};
  app = spawn(exe, [], {env, stdio: 'ignore'});
  await once(app, 'spawn');
  const report = execFileSync('powershell.exe', ['-NoProfile', '-File',
    path.resolve('scripts/windows-webview-title.ps1'), '-AppProcessId', String(app.pid), '-Mode', mode
  ], {env, encoding:'utf8', timeout:90000}).trim();
  console.log(report);
  if (mode === 'fixture') {
    const match = report.match(/BLOTQA_RESULT ([A-Za-z0-9+/=]+)/);
    assert.ok(match, 'No test result in native WebView title.');
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (result.error) throw Error(result.error);
    console.log('Native fixture result:', result.values);
    return result.values;
  }
}

async function closeNormally() {
  const exited = once(app, 'exit', {signal:AbortSignal.timeout(25000)});
  const reply = execFileSync('powershell.exe', ['-NoProfile','-Command',
    '(Get-Process -Id ' + app.pid + ').CloseMainWindow()'], {encoding:'utf8', timeout:10000});
  assert.equal(reply.trim(), 'True', 'Native window must accept the close request.');
  assert.equal((await exited)[0], 0);
  app = null;
}

// This function is appended to a disposable copy of the original HTML only.
async function exercise(settings) {
  let report;
  try {
    const B = globalThis.BS;
    await B.ready;
    if (settings.phase === 'import') {
      if (B.state.p.sources.length || B.getGroup().objects.length) throw Error('Expected empty project.');
      const input = document.getElementById('images-input');
      const files = new DataTransfer();
      files.items.add(new File([B.unbase64(settings.tiff)], 'ARM synthetic.tif', {type:'image/tiff'}));
      input.files = files.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
      const deadline = Date.now() + 15000;
      while (!B.state.p.sources.length && Date.now() < deadline) await new Promise(done => setTimeout(done, 100));
      const source = B.state.p.sources[0];
      if (!source) throw Error('The input control did not import the TIFF.');
      const r = B.measure(source, {x:0,y:0,w:2,h:1}, {x:2,y:0,w:2,h:1});
      const values = [source.bitDepth, source.width, source.height, source.hash, r.mean, r.raw, r.corrected];
      if (!(await B.flushSave())) throw Error('IndexedDB did not confirm initial save.');
      // Only the actual native closing handshake may persist the next edit.
      const persist = B.persist;
      B.persist = () => {};
      try { B.commit('SYNTHETIC ARM close check', p => { p.name = settings.name; }); }
      finally { B.persist = persist; }
      report = {values};
    } else {
      report = {values:[B.state.p.name, B.state.p.sources[0]?.hash, B.getGroup().objects.length]};
    }
  } catch (error) {
    report = {error:String(error?.stack || error)};
  }
  const title = 'BLOTQA_RESULT ' + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(report))));
  document.title = title;
  setInterval(() => { document.title = title; }, 300);
}

async function setPhase(phase) {
  const settings = {phase, name:'SYNTHETIC ARM pending', tiff:phase === 'import' ? fixture.toString('base64') : ''};
  const script = '<script>(' + exercise.toString() + ')(' + JSON.stringify(settings) + ')</script>';
  assert.ok(original.includes('</body>'));
  await writeFile(qaHtml, original.replace('</body>', () => script + '</body>'));
}

try {
  await nativeCase(executable, path.join(temporary, 'stock profile'), 'stock');
  await closeNormally();
  console.log('PASS: the unmodified ARM64 executable displayed the production WebView and closed normally.');

  await cp(path.dirname(executable), qaInstall, {recursive:true});
  const profile = path.join(temporary, 'fixture profile');
  await setPhase('import');
  const measured = await nativeCase(qaExe, profile, 'fixture');
  assert.deepEqual(measured, [16,73,39,hash,39.5,130991,316]);
  await closeNormally();
  console.log('PASS: the native ARM64 fixture used the file input and matched independent TIFF values and SHA-256.');

  await setPhase('restore');
  assert.deepEqual(await nativeCase(qaExe, profile, 'fixture'), ['SYNTHETIC ARM pending',hash,1]);
  await closeNormally();
  console.log('PASS: the ARM64 native close persisted a pending edit and relaunch restored the original and layout.');
} finally {
  if (app?.pid && app.exitCode === null && app.signalCode === null) {
    const exited = once(app, 'exit', {signal:AbortSignal.timeout(10000)});
    if (app.kill()) await exited;
  }
  await rm(temporary, {recursive:true, force:true, maxRetries:10, retryDelay:250});
}
