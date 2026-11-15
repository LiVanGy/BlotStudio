import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.platform, 'win32', 'This check requires the native Windows app.');
const executable = path.resolve(process.argv[2] ?? 'dist/windows-x64/BlotStudio.exe');
const profile = await mkdtemp(path.join(tmpdir(), 'BlotStudio WebView2 '));
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
    socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, awaitPromise: true, returnByValue: true}}));
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
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 250});
}
