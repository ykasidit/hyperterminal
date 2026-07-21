import {
  createTerm, feed, getText, clearTerm,
  formatPortSettings, formatDuration,
  outTransform, createInTransform,
} from './logic.js';
import { DemoPort, DEMO_DEVICES } from './demo.js';

const $ = (id) => document.getElementById(id);

// ---------- state ----------
const term = createTerm();
let port = null, reader = null, writer = null;
let connected = false, connectedAt = 0, timerId = 0;
let capture = null; // null = off, [] = capturing
let sessionName = 'hyperterm';
const settings = { baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1, flowControl: 'none', connectUsing: 'serial' };
const ascii = { sendLineEndsWithLf: false, echoLocally: false, appendLfToIncoming: false };
let inTf = createInTransform(ascii);
const encoder = new TextEncoder();

const BAUDS = [110, 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const supported = 'serial' in navigator;

// ---------- terminal rendering ----------
const screen = $('screen'), termEl = $('term');
const cursorSpan = document.createElement('span');
cursorSpan.id = 'cursor';
cursorSpan.textContent = ' ';
let pendingRender = false;

function termHasSelection() {
  const sel = document.getSelection();
  return sel && !sel.isCollapsed && termEl.contains(sel.anchorNode);
}

function render() {
  // copy-friendly: don't destroy an in-progress selection; flush when it clears
  if (termHasSelection()) { pendingRender = true; return; }
  pendingRender = false;
  const atBottom = termEl.scrollTop + termEl.clientHeight >= termEl.scrollHeight - 20;
  screen.textContent = getText(term);
  screen.appendChild(cursorSpan);
  if (atBottom) termEl.scrollTop = termEl.scrollHeight;
}
document.addEventListener('selectionchange', () => {
  if (pendingRender && !termHasSelection()) render();
});

function printLocal(text) { feed(term, text); render(); }

let toastEl = null, toastTimer = 0;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast-xp';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

// ---------- serial ----------
async function call() {
  if (connected) return;
  const demo = settings.connectUsing !== 'serial';
  if (!demo && !supported) { openDlg('dlgAbout'); return; }
  try {
    if (demo) port = new DemoPort(settings.connectUsing);
    else if (!port) port = await navigator.serial.requestPort();
    await port.open({ ...settings });
  } catch (e) {
    if (e.name !== 'NotFoundError') printLocal(`\r\n[${e.message}]\r\n`);
    if (port && !port.readable) port = null;
    return;
  }
  connected = true;
  connectedAt = Date.now();
  writer = port.writable.getWriter();
  termEl.classList.add('connected');
  timerId = setInterval(updateConnStatus, 1000);
  updateConnStatus();
  termEl.focus();
  readLoop();
}

async function readLoop() {
  const decoder = new TextDecoder();
  try {
    reader = port.readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      let text = decoder.decode(value, { stream: true });
      text = inTf(text);
      if (capture) capture.push(text);
      feed(term, text);
      render();
    }
  } catch (e) {
    if (connected) printLocal(`\r\n[read error: ${e.message}]\r\n`);
  } finally {
    try { reader && reader.releaseLock(); } catch {}
    reader = null;
    if (connected) disconnect(); // device unplugged mid-session
  }
}

async function disconnect() {
  if (!connected) return;
  connected = false;
  clearInterval(timerId);
  try { reader && await reader.cancel(); } catch {}
  try { writer && writer.releaseLock(); } catch {}
  writer = null;
  try { port && await port.close(); } catch {}
  if (port?.isDemo) port = null;
  termEl.classList.remove('connected');
  updateConnStatus();
}

async function send(text) {
  if (!connected || !writer) return;
  const out = outTransform(text, ascii);
  if (ascii.echoLocally) printLocal(out);
  try { await writer.write(encoder.encode(out)); }
  catch (e) { printLocal(`\r\n[write error: ${e.message}]\r\n`); }
}

if (supported) {
  navigator.serial.addEventListener('disconnect', (e) => {
    if (e.target === port) { disconnect(); port = null; printLocal('\r\n[device disconnected]\r\n'); }
  });
}

// ---------- status bar ----------
function updateConnStatus() {
  const demoTag = port?.isDemo ? ' (DEMO)' : '';
  $('sbConn').textContent = connected
    ? `Connected${demoTag} ` + formatDuration((Date.now() - connectedAt) / 1000)
    : 'Disconnected';
  $('sbSettings').textContent = port?.isDemo ? 'SIMULATED' : formatPortSettings(settings);
}
function updateLocks(e) {
  for (const [id, key] of [['sbScroll', 'ScrollLock'], ['sbCaps', 'CapsLock'], ['sbNum', 'NumLock']]) {
    $(id).classList.toggle('dim', !e.getModifierState(key));
  }
}

// ---------- keyboard ----------
const ANSI = { ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D' };

termEl.addEventListener('keydown', (e) => {
  updateLocks(e);
  if (e.metaKey) return;
  if (e.ctrlKey) {
    if (e.key === 'c' && termHasSelection()) return;      // native copy
    if (e.key === 'v') { e.preventDefault(); pasteToHost(); return; }
    if (e.key === 'a') { e.preventDefault(); selectAllScreen(); return; }
    if (e.key.length === 1 && /[a-z]/.test(e.key)) {      // ^C ^D ^Z ... to host
      e.preventDefault();
      send(String.fromCharCode(e.key.charCodeAt(0) - 96));
    }
    return;
  }
  const special = { Enter: '\r', Backspace: '\b', Tab: '\t', Escape: '\x1b', ...ANSI }[e.key];
  if (special) { e.preventDefault(); send(special); return; }
  if (e.key.length === 1) { e.preventDefault(); send(e.key); }
});

termEl.addEventListener('paste', (e) => {
  e.preventDefault();
  if (!connected) { toast('Paste failed - not connected. Call > Call (or the \u{1F4DE} button) first, then paste again.'); return; }
  send(e.clipboardData.getData('text'));
});

function selectAllScreen() {
  const range = document.createRange();
  range.selectNodeContents(screen);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

async function copySelection() {
  const sel = document.getSelection().toString();
  if (sel) { try { await navigator.clipboard.writeText(sel); } catch {} }
}

async function pasteToHost() {
  if (!connected) { toast('Paste failed - not connected. Call > Call (or the \u{1F4DE} button) first, then paste again.'); return; }
  try { send(await navigator.clipboard.readText()); }
  catch { printLocal('\r\n[clipboard read blocked - use right-click paste]\r\n'); }
}

// ---------- capture / files ----------
function toggleCapture() {
  if (capture) {
    const blob = new Blob(capture, { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'capture.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    capture = null;
  } else {
    capture = [];
  }
  $('sbCapture').classList.toggle('dim', !capture);
}

function sendTextFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,text/*';
  input.onchange = async () => {
    const f = input.files[0];
    if (f) send(await f.text());
  };
  input.click();
}

// ---------- session save ----------
function saveSession() {
  localStorage.setItem('hyperterm_session', JSON.stringify({ sessionName, settings, ascii }));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem('hyperterm_session'));
    if (!s) return;
    sessionName = s.sessionName || sessionName;
    Object.assign(settings, s.settings);
    Object.assign(ascii, s.ascii);
    inTf = createInTransform(ascii);
    setTitle();
  } catch {}
}
function setTitle() {
  $('titleText').textContent = `${sessionName} - HyperTerminal`;
  document.title = `${sessionName} - HyperTerminal online`;
}

// ---------- dialogs ----------
function openDlg(id) { $(id).hidden = false; }
function closeDlg(id) { $(id).hidden = true; termEl.focus(); }
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => closeDlg(b.dataset.close)));

// Connection Description -> COM Properties
const ICONS = ['☎', '📟', '💻', '🛰', '📠', '🌐', '📡'];
const iconStrip = $('iconStrip');
ICONS.forEach((ic, i) => {
  const d = document.createElement('div');
  d.className = 'conn-icon' + (i === 0 ? ' sel' : '');
  d.textContent = ic;
  d.onclick = () => {
    iconStrip.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
    d.classList.add('sel');
  };
  iconStrip.appendChild(d);
});
$('newOk').onclick = () => {
  sessionName = $('connName').value.trim() || 'hyperterm';
  setTitle();
  closeDlg('dlgNew');
  openProps();
};

// COM Properties
const connSel = $('setConnUsing');
for (const [value, dev] of Object.entries(DEMO_DEVICES)) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = dev.label;
  connSel.appendChild(o);
}
const baudSel = $('setBaud');
BAUDS.forEach((b) => {
  const o = document.createElement('option');
  o.value = o.textContent = b;
  baudSel.appendChild(o);
});
function openProps() {
  $('setConnUsing').value = settings.connectUsing;
  baudSel.value = settings.baudRate;
  $('setData').value = settings.dataBits;
  $('setParity').value = settings.parity;
  $('setStop').value = settings.stopBits;
  $('setFlow').value = settings.flowControl;
  openDlg('dlgProps');
}
$('propsRestore').onclick = () => {
  baudSel.value = 115200; $('setData').value = 8; $('setParity').value = 'none';
  $('setStop').value = 1; $('setFlow').value = 'none';
};
$('propsOk').onclick = async () => {
  const newConn = $('setConnUsing').value;
  if (newConn !== settings.connectUsing) { await disconnect(); port = null; }
  settings.connectUsing = newConn;
  settings.baudRate = +baudSel.value;
  settings.dataBits = +$('setData').value;
  settings.parity = $('setParity').value;
  settings.stopBits = +$('setStop').value;
  settings.flowControl = $('setFlow').value;
  updateConnStatus();
  closeDlg('dlgProps');
  if (connected) { await disconnect(); call(); } // apply new settings, redial
};

// ASCII Setup
function openAscii() {
  $('ascSendLf').checked = ascii.sendLineEndsWithLf;
  $('ascEcho').checked = ascii.echoLocally;
  $('ascInLf').checked = ascii.appendLfToIncoming;
  openDlg('dlgAscii');
}
$('asciiOk').onclick = () => {
  ascii.sendLineEndsWithLf = $('ascSendLf').checked;
  ascii.echoLocally = $('ascEcho').checked;
  ascii.appendLfToIncoming = $('ascInLf').checked;
  inTf = createInTransform(ascii);
  closeDlg('dlgAscii');
};

// ---------- menus ----------
const MENUS = [
  ['File', () => [
    ['New Connection...', () => openDlg('dlgNew')],
    ['Open...', null],
    ['Save', saveSession],
    ['Save As...', null],
    'sep',
    ['Page Setup...', null],
    ['Print...', null],
    'sep',
    ['Properties', openProps],
    'sep',
    ['Exit', () => window.close()],
  ]],
  ['Edit', () => [
    ['Copy', copySelection, termHasSelection()],
    ['Paste to Host', pasteToHost, connected],
    ['Select All', selectAllScreen],
    'sep',
    ['Clear Screen', () => { clearTerm(term); render(); }],
    ['Clear Backscroll', () => { clearTerm(term); render(); }],
  ]],
  ['View', () => [
    ['Toolbar', () => $('toolbar').hidden = !$('toolbar').hidden, true, !$('toolbar').hidden],
    ['Status Bar', () => document.querySelector('.status-bar').hidden = !document.querySelector('.status-bar').hidden,
      true, !document.querySelector('.status-bar').hidden],
    'sep',
    ['ASCII Setup...', openAscii],
  ]],
  ['Call', () => [
    ['Call', call, supported && !connected],
    ['Wait for a Call', null],
    ['Stop Waiting', null],
    'sep',
    ['Disconnect', disconnect, connected],
  ]],
  ['Transfer', () => [
    ['Send File...', null],
    ['Receive File...', null],
    'sep',
    [capture ? 'Stop Capture (save .txt)' : 'Capture Text...', toggleCapture, true, !!capture],
    ['Send Text File...', sendTextFile, connected],
    ['Capture to Printer', null],
  ]],
  ['Help', () => [
    ['About HyperTerminal', () => openDlg('dlgAbout')],
  ]],
];

const menubar = $('menubar');
let openPopup = null;
function closeMenus() {
  if (openPopup) { openPopup.remove(); openPopup = null; }
  menubar.querySelectorAll('.open').forEach((t) => t.classList.remove('open'));
}
MENUS.forEach(([title, itemsFn]) => {
  const t = document.createElement('div');
  t.className = 'menu-title';
  t.textContent = title;
  t.onclick = (e) => {
    e.stopPropagation();
    const wasOpen = t.classList.contains('open');
    closeMenus();
    if (wasOpen) return;
    t.classList.add('open');
    const pop = document.createElement('div');
    pop.className = 'menu-popup';
    for (const item of itemsFn()) {
      if (item === 'sep') {
        const s = document.createElement('div');
        s.className = 'menu-sep';
        pop.appendChild(s);
        continue;
      }
      const [label, action, enabled = !!action, checked = false] = item;
      const mi = document.createElement('div');
      mi.className = 'menu-item' + (enabled && action ? '' : ' disabled');
      mi.style.position = 'relative';
      mi.innerHTML = (checked ? '<span class="check">✓</span>' : '') + label.replace(/</g, '&lt;');
      if (enabled && action) mi.onclick = () => { closeMenus(); action(); };
      pop.appendChild(mi);
    }
    const r = t.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = r.bottom + 'px';
    document.body.appendChild(pop);
    openPopup = pop;
  };
  menubar.appendChild(t);
});
document.addEventListener('click', closeMenus);

// ---------- toolbar ----------
const TOOLS = [
  ['📄', 'New Connection', () => openDlg('dlgNew')],
  ['📂', 'Open', null],
  'sep',
  ['📞', 'Call', call],
  ['🔌', 'Disconnect', disconnect],
  'sep',
  ['📤', 'Send File', null],
  ['📥', 'Receive File', null],
  'sep',
  ['⚙', 'Properties', openProps],
];
const toolbar = $('toolbar');
TOOLS.forEach((tdef) => {
  if (tdef === 'sep') {
    const s = document.createElement('div');
    s.className = 'tb-sep';
    toolbar.appendChild(s);
    return;
  }
  const [glyph, tip, action] = tdef;
  const b = document.createElement('button');
  b.textContent = glyph;
  b.title = tip;
  if (action) b.onclick = action; else b.disabled = true;
  toolbar.appendChild(b);
});

// ---------- fake window controls ----------
const WINDOW_JOKES = {
  Minimize: "Minimize? I'm just a web tab wearing an XP costume - the real buttons are upstairs.",
  Maximize: "I only imitate the looks - for the real thing your browser does F11.",
  Close: "Nice try! I'm a web page cosplaying as Windows XP. Close my tab if you really must (Ctrl+W).",
};
document.querySelectorAll('#app .title-bar-controls button').forEach((b) =>
  b.addEventListener('click', () => toast(WINDOW_JOKES[b.getAttribute('aria-label')])));

// ---------- boot ----------
loadSession();
setTitle();
updateConnStatus();
if (!supported) {
  printLocal(
    'Web Serial API not available in this browser.\r\n' +
    'Please use Chrome or Edge on desktop (Firefox/Safari do not support it yet).\r\n');
  printLocal(
    `No hardware? Try a DEMO simulated device: File > Properties > Connect using.\r\n\r\n`);
} else {
  printLocal(
    `Welcome to HyperTerminal online.\r\n` +
    `Call > Call (or the \u{1F4DE} button) to pick a serial port and connect.\r\n` +
    `File > Properties sets baud rate and port settings.\r\n` +
    `No hardware handy? File > Properties > Connect using > DEMO simulated devices.\r\n\r\n`);
}
termEl.focus();
