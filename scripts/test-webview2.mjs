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
const isArmRunner = process.arch === 'arm64' || process.env.RUNNER_ARCH === 'ARM64';
const debugPort = isArmRunner ? 0 : 9328;
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

function devtools(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const receive = event => {
      const reply = JSON.parse(event.data);
      if (reply.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', receive);
      if (reply.error) reject(Error(reply.error.message));
      else resolve(reply.result);
    };
    const timer = setTimeout(() => {
      socket.removeEventListener('message', receive);
      reject(Error('WebView2 did not complete the requested check.'));
    }, 15000);
    socket.addEventListener('message', receive);
    socket.send(JSON.stringify({id, method, params}));
  });
}

async function evaluate(expression) {
  const result = await devtools('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true, userGesture:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function launch() {
  child = spawn(executable, [], {
    cwd: files,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + debugPort + ' --remote-debugging-address=127.0.0.1'
    }
  });
  await once(child, 'spawn');
  const target = await until('BlotStudio WebView2 page', async () => {
    let port = debugPort;
    if (port === 0) {
      const discoveryFile = path.join(profile, 'EBWebView', 'DevToolsActivePort');
      port = Number((await readFile(discoveryFile, 'utf8')).split(/\r?\n/, 1)[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('WebView2 returned an invalid debug port.');
    }
    const endpoint = 'http://127.0.0.1:' + port + '/json/list';
    const response = await fetch(endpoint, {signal: AbortSignal.timeout(1000)}).catch(error => {
      throw Error(endpoint + ': ' + (error.cause?.message || error.message));
    });
    return (await response.json()).find(page => page.url === appUrl && page.webSocketDebuggerUrl);
  }, 45000);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open', {signal: AbortSignal.timeout(10000)});
  await until('BlotStudio startup', () => evaluate('Boolean(globalThis.BS?.state?.p)'));
}

function driveDialog(action, target = '') {
  const args = ['-NoProfile', '-NonInteractive', '-File',
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
  const expectedName = path.parse(projectFile).name;
  const label = 'SYNTHETIC manual overwrite';
  await evaluate('BS.commit("SYNTHETIC file name", p => {p.name=' + JSON.stringify(expectedName) + ';})');
  const projectId = await evaluate('BS.state.p.id');
  const readProject = async filename => JSON.parse(await readFile(filename, 'utf8'));

  const cancelled = await nativeDialog('BS.actions.save()', 'cancel');
  assert.equal(cancelled.ok, false);
  assert.match(cancelled.message, /取消/);
  assert.deepEqual(await readdir(files), ['备份 目录']);
  assert.deepEqual(await nativeDialog('BS.actions.save()', 'save', projectFile), {ok: true});
  const manuallySaved = await readProject(projectFile);
  assert.equal(manuallySaved.sources[0].hash, originalHash);
  assert.deepEqual(Buffer.from(manuallySaved.sources[0].original.split(',')[1], 'base64'), fixture);
  await evaluate('BS.commit("SYNTHETIC overwrite", p => {p.groups[0].name=' + JSON.stringify(label) + ';})');
  assert.deepEqual(await nativeDialog('BS.actions.save()', 'overwrite', projectFile), {ok: true});
  assert.equal((await readProject(projectFile)).groups[0].name, label);
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
  assert.equal(await evaluate('BS.syncWorkspace()'), true);
  const originalBackup = await readFile(managed);
  const protectedName = 'SYNTHETIC backup retry';
  await evaluate('BS.commit("SYNTHETIC pending backup", p => {p.name=' + JSON.stringify(protectedName) + ';})');

  // FileShare.Read keeps the valid backup readable but forbids replacement.
  const locker = spawn('powershell.exe', ['-NoProfile','-Command',
    '$f=[IO.File]::Open($env:BLOTSTUDIO_QA_LOCK,"Open","Read","Read"); try {[Console]::WriteLine("LOCKED"); [void][Console]::ReadLine()}finally{$f.Dispose()}'
  ], {env:{...process.env,BLOTSTUDIO_QA_LOCK:managed}, stdio:['pipe','pipe','inherit']});
  const ended = once(locker, 'exit');
  try {
    const [data] = await once(locker.stdout, 'data', {signal:AbortSignal.timeout(10000)});
    assert.match(data.toString(), /LOCKED/);
    const failed = await evaluate('BS.syncWorkspace().then(() => false, () => BS.workspaceState.status.includes("失败"))');
    assert.equal(failed, true);
    assert.deepEqual(await readFile(managed), originalBackup, 'Failed backup must preserve every original byte.');
    assert.deepEqual(await readdir(folder), [path.basename(managed)]);
  } finally {
    locker.stdin.end('\n');
    await ended;
  }
  assert.equal(await evaluate('BS.syncWorkspace()'), true);
  const restored = await readProject(managed);
  assert.equal(restored.name, protectedName);
  assert.deepEqual(Buffer.from(restored.sources[0].original.split(',')[1], 'base64'),fixture);
  console.log('PASS: folder cancellation, failed overwrite preserving every previous byte, temporary-file cleanup and retry verified on disk.');
}

async function checkSmallWindow() {
  // The real host is resized once. Chromium zoom/DPR at 125% and 150% are emulated.
  const script = 'Add-Type -Name Native -Namespace BlotTest -MemberDefinition \'[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int width, int height, uint flags);\';' +
    '$h=(Get-Process -Id ' + child.pid + ').MainWindowHandle; if (-not [BlotTest.Native]::SetWindowPos($h,[IntPtr]::Zero,0,0,800,600,6)) { throw "Minimum window resize failed" }';
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {timeout:10000});
  const measured = await until('Native minimum-size viewport', () => evaluate('innerWidth <= 800 ? {w:innerWidth,h:innerHeight,dpr:devicePixelRatio} : null'));
  const width = Math.round(measured.w * measured.dpr), height = Math.round(measured.h * measured.dpr);
  for (const scale of [1,1.25,1.5]) {
    const viewportWidth = Math.floor(width / scale), viewportHeight = Math.floor(height / scale);
    await devtools('Emulation.setDeviceMetricsOverride', {width:viewportWidth,height:viewportHeight,deviceScaleFactor:scale,mobile:false});
    const report = await evaluate('(' + inspectControls.toString() + ')()');
    assert.deepEqual(report.hidden, [], 'Control unreachable at ' + scale + 'x: ' + JSON.stringify(report));
    assert.equal(report.dpr, scale);
    console.log('PASS: WebView2 control hit tests at ' + JSON.stringify(report));
  }
  await devtools('Emulation.clearDeviceMetricsOverride', {});
}

async function inspectControls() {
  const hidden = [];
  function check(button, name) {
    const box = button?.getBoundingClientRect();
    const x = box && (box.left + box.width / 2), y = box && (box.top + box.height / 2);
    if (!box?.width || !box.height || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight ||
        !button.contains(document.elementFromPoint(x,y))) hidden.push(name);
  }
  const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  for (const id of ['design','analysis','edit','stats']) {
    const button = document.querySelector('[data-action="tab"][data-id="' + id + '"]');
    check(button, id);
    button.click();
    await frame();
    if (BS.state.ui.tab !== id) hidden.push('switch to ' + id);
    for (const action of ['save','export','project-menu']) check(document.querySelector('header [data-action="' + action + '"]'), id + '/' + action);
  }
  document.querySelector('header [data-action="export"]').click();
  await frame();
  const dialog = document.querySelector('[role="dialog"]');
  for (const action of ['close-modal','do-export']) check(dialog?.querySelector('[data-action="' + action + '"]'), 'export/' + action);
  BS.actions['close-modal']();
  return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,hidden};
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

  let layoutError;
  try { await checkSmallWindow(); } catch (error) {
    layoutError = error;
    console.error('Small-window diagnostic:', error.message);
    await devtools('Emulation.clearDeviceMetricsOverride', {});
  }

  // Delay the usual debounce so only the native close path can save this edit.
  await evaluate('(() => { const persist = BS.persist; BS.persist = () => {}; try { BS.commit("SYNTHETIC close test", project => { project.name = ' +
    JSON.stringify(savedName) + '; }); } finally { BS.persist = persist; } })()');
  await close();
  await launch();
  assert.deepEqual(await evaluate('({name: BS.state.p.name, hash: BS.state.p.sources[0]?.hash, objects: BS.getGroup().objects.length})'),
    {name: savedName, hash: originalHash, objects: 1});
  console.log('PASS: normal Windows close saves pending edits and reopening restores the original and layout.');
  await checkFiles();
  assert.equal(await evaluate('BS.flushSave()'), true);
  await close();
  if (layoutError) throw layoutError;
} catch (error) {
  if (child?.pid && child.exitCode === null) {
    const diagnostic = 'Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; ' +
      '$root=[System.Windows.Automation.AutomationElement]::RootElement; $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty,[int]' + child.pid + '); ' +
      '$windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,$condition); foreach($win in $windows){Write-Output ("BlotStudio HWND: "+$win.Current.Name); $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Select-Object -First 20 | ForEach-Object {Write-Output ($_.Current.ClassName+" | "+$_.Current.Name)}}';
    try { execFileSync('powershell.exe', ['-NoProfile','-Command',diagnostic], {stdio:'inherit',timeout:7000}); } catch {}
  }
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    if (child.kill()) await Promise.race([exited, delay(5000)]);
  }
  await rm(files, {recursive: true, force: true, maxRetries: 10, retryDelay: 250});
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 250});
}
