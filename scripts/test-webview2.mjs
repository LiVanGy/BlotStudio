import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.platform, 'win32', 'This check requires the native Windows app.');
const executable = path.resolve(process.argv[2] ?? 'dist/windows-x64/BlotStudio.exe');
const profile = await mkdtemp(path.join(tmpdir(), 'BlotStudio WebView2 '));
const files = await mkdtemp(path.join(tmpdir(), 'BlotStudio 文件 验收 '));
const fixture = await readFile('tests/fixtures/native16-raw.tif');
const originalHash = 'sha256:' + createHash('sha256').update(fixture).digest('hex');
const savedName = 'SYNTHETIC · Windows 关闭恢复';
const appUrl = 'https://blotstudio.local/BlotStudio.html';
const endpoint = 'http://127.0.0.1:9328/json/list';
let child;
let socket;
let sequence = 0;

async function until(label, callback, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let detail = '';
  while (Date.now() < deadline) {
    try {
      const result = await callback();
      if (result) return result;
    } catch (error) {
      detail = ': ' + error.message;
    }
    await delay(150);
  }
  throw Error(label + ' timed out' + detail);
}

function evaluate(expression) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const receive = event => {
      const reply = JSON.parse(event.data);
      if (reply.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', receive);
      const error = reply.error?.message ?? reply.result?.exceptionDetails?.exception?.description ?? reply.result?.exceptionDetails?.text;
      if (error) reject(Error(error));
      else resolve(reply.result?.result?.value);
    };
    const timer = setTimeout(() => {
      socket.removeEventListener('message', receive);
      reject(Error('WebView2 did not complete the requested check.'));
    }, 15000);
    socket.addEventListener('message', receive);
    socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, awaitPromise: true, returnByValue: true, userGesture: true}}));
  });
}

async function launch() {
  child = spawn(executable, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9328 --remote-debugging-address=127.0.0.1'
    }
  });
  await once(child, 'spawn');
  const target = await until('BlotStudio WebView2 page', async () => {
    const response = await fetch(endpoint, {signal: AbortSignal.timeout(1000)});
    return (await response.json()).find(page => page.url === appUrl && page.webSocketDebuggerUrl);
  }, 45000);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open', {signal: AbortSignal.timeout(10000)});
  await until('BlotStudio startup', () => evaluate('Boolean(globalThis.BS?.state?.p)'));
}

function driveDialog(action, target = '') {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.resolve('scripts/windows-dialog-test.ps1'), '-AppProcessId', String(child.pid), '-Action', action];
  if (target) args.push('-TargetPath', target);
  execFileSync('powershell.exe', args, {stdio: 'inherit', timeout: 45000});
}

async function nativeDialog(operation, action, target) {
  await evaluate('globalThis.__qaDialog = null; Promise.resolve(' + operation +
    ').then(() => { __qaDialog = {ok:true}; }, error => { __qaDialog = {ok:false, message:error.message}; }); true');
  driveDialog(action, target);
  return until('Native dialog completion: ' + action, () => evaluate('globalThis.__qaDialog'));
}

async function checkFiles() {
  const projectFile = path.join(files, '定量 项目.wbproj');
  const folder = path.join(files, '备份 目录');
  await mkdir(folder);
  const expectedName = 'SYNTHETIC manual overwrite';
  const projectId = await evaluate('BS.state.p.id');
  const readProject = async filename => JSON.parse(await readFile(filename, 'utf8'));

  const cancelled = await nativeDialog('BS.actions.save()', 'cancel');
  assert.equal(cancelled.ok, false);
  assert.match(cancelled.message, /取消/);
  assert.deepEqual(await readdir(files), ['备份 目录']);
  assert.deepEqual(await nativeDialog('BS.actions.save()', 'save', projectFile), {ok: true});
  assert.equal((await readProject(projectFile)).sources[0].hash, originalHash);
  await evaluate('BS.commit("SYNTHETIC rename", p => {p.name=' + JSON.stringify(expectedName) + ';})');
  assert.deepEqual(await nativeDialog('BS.actions.save()', 'overwrite', projectFile), {ok: true});
  assert.equal((await readProject(projectFile)).name, expectedName);
  await evaluate('BS.commit("SYNTHETIC unsaved edit", p => {p.name="discard this edit";})');
  await evaluate('BS.actions.open(); true');
  driveDialog('open', projectFile);
  await until('Reopen native project file', () => evaluate('BS.state.p.name === ' + JSON.stringify(expectedName)));
  assert.deepEqual(await evaluate('({id:BS.state.p.id, hash:BS.state.p.sources[0].hash})'), {id:projectId, hash:originalHash});
  console.log('PASS: native Save cancellation, retry, overwrite confirmation, and Open preserve the project file on disk.');

  assert.deepEqual(await nativeDialog('BS.chooseWorkspace()', 'folder', folder), {ok: true});
  const folderCancel = await nativeDialog('BS.chooseWorkspace()', 'cancel');
  assert.equal(folderCancel.ok, false);
  assert.match(folderCancel.message, /取消/);
  const managed = path.join(folder, 'BlotStudio-' + projectId + '.wbproj');
  await mkdir(managed);
  const failed = await evaluate('BS.syncWorkspace().then(() => false, () => BS.workspaceState.status.includes("失败"))');
  assert.equal(failed, true);
  assert.deepEqual(await readdir(managed), []);
  assert.deepEqual(await readdir(folder), [path.basename(managed)]);
  await rm(managed, {recursive: true});
  assert.equal(await evaluate('BS.syncWorkspace()'), true);
  assert.deepEqual([(await readProject(managed)).name, (await readProject(managed)).sources[0].hash], [expectedName,originalHash]);
  console.log('PASS: native folder selection, cancellation, write failure, cleanup and retry yield a readable disk backup.');
}

async function close() {
  const processId = child.pid;
  const closed = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    '(Get-Process -Id ' + processId + ').CloseMainWindow()'
  ], {encoding: 'utf8', timeout: 10000}).trim();
  assert.equal(closed, 'True', 'A close request must reach the native application window.');
  await until('Native close after IndexedDB acknowledgement', () => child.exitCode !== null, 20000);
  assert.equal(child.exitCode, 0);
  socket.close();
}

try {
  await launch();
  assert.deepEqual(await evaluate('({sources: BS.state.p.sources.length, objects: BS.getGroup().objects.length, tabs: document.querySelectorAll(\'[data-action="tab"]\').length})'),
    {sources: 0, objects: 0, tabs: 4});
  console.log('PASS: native Windows window loads the empty offline workspace.');

  await evaluate('(() => { const input = document.getElementById("images-input"); const files = new DataTransfer(); files.items.add(new File([BS.unbase64(' +
    JSON.stringify(fixture.toString('base64')) + ')], "SYNTHETIC 16-bit.tif", {type:"image/tiff"})); input.files = files.files; input.dispatchEvent(new Event("change", {bubbles: true})); })()');
  await until('Native-depth TIFF import', () => evaluate('BS.state.p.sources.length === 1'));
  assert.deepEqual(await evaluate('(() => { const s = BS.state.p.sources[0]; const r = BS.measure(s, {x:0,y:0,w:2,h:1}, {x:2,y:0,w:2,h:1}); return {depth:s.bitDepth, width:s.width, height:s.height, hash:s.hash, mean:r.mean, raw:r.raw, corrected:r.corrected}; })()'),
    {depth: 16, width: 73, height: 39, hash: originalHash, mean: 39.5, raw: 130991, corrected: 316});
  assert.equal(await evaluate('BS.flushSave()'), true);
  console.log('PASS: WebView2 decodes the original TIFF and matches the expected native-depth measurement and SHA-256.');

  await checkFiles();
  assert.equal(await evaluate('BS.flushSave()'), true);

  // Delay the usual debounce so only the native close path can save this edit.
  await evaluate('(() => { const persist = BS.persist; BS.persist = () => {}; try { BS.commit("SYNTHETIC close test", project => { project.name = ' +
    JSON.stringify(savedName) + '; }); } finally { BS.persist = persist; } })()');
  await close();
  await launch();
  assert.deepEqual(await evaluate('({name: BS.state.p.name, hash: BS.state.p.sources[0]?.hash, objects: BS.getGroup().objects.length})'),
    {name: savedName, hash: originalHash, objects: 1});
  await close();
  console.log('PASS: normal Windows close saves pending edits and reopening restores the original and layout.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    if (child.kill()) await Promise.race([exited, delay(5000)]);
  }
  await rm(files, {recursive: true, force: true, maxRetries: 10, retryDelay: 250});
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 250});
}
