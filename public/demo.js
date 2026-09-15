// HyperTerminal by ClearEvo.com - demo.js
// Copyright (C) 2026 Kasidit Yusuf
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
// Source: https://github.com/ykasidit/hyperterminal

// DEMO simulated devices - NOT real serial ports. Pure logic + a SerialPort-shaped
// fake so the app's read/write loop works unchanged. Unit-tested in test/demo.test.js.

// McCormick Hospital, Chiang Mai, Thailand
export const MCCORMICK = { lat: 18.7961, lon: 99.0080, altM: 310.0 };

// ---------- NMEA building blocks ----------
export function nmeaChecksum(body) {
  let x = 0;
  for (const ch of body) x ^= ch.charCodeAt(0);
  return x.toString(16).toUpperCase().padStart(2, '0');
}

export function nmeaWrap(body) {
  return `$${body}*${nmeaChecksum(body)}\r\n`;
}

// decimal degrees -> NMEA ddmm.mmmm / dddmm.mmmm + hemisphere
export function degToNmea(deg, isLon) {
  const hemi = isLon ? (deg < 0 ? 'W' : 'E') : (deg < 0 ? 'S' : 'N');
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = (abs - d) * 60;
  const dStr = String(d).padStart(isLon ? 3 : 2, '0');
  const mStr = m.toFixed(4).padStart(7, '0');
  return { dm: `${dStr}${mStr}`, hemi };
}

function utcTime(now) {
  return `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}.00`;
}
function utcDate(now) {
  return `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCFullYear() % 100).padStart(2, '0')}`;
}

// One 1 Hz NMEA burst. talker 'GN' (u-blox-like multi-constellation) or 'GP' (MTK-like).
export function nmeaBurst(talker, now, pos = MCCORMICK) {
  const lat = degToNmea(pos.lat, false);
  const lon = degToNmea(pos.lon, true);
  const t = utcTime(now);
  const out = [
    nmeaWrap(`${talker}GGA,${t},${lat.dm},${lat.hemi},${lon.dm},${lon.hemi},1,10,0.9,${pos.altM.toFixed(1)},M,-28.0,M,,`),
    nmeaWrap(`${talker}GSA,A,3,01,03,06,09,17,19,22,28,,,,,1.5,0.9,1.2`),
  ];
  if (talker === 'GN') {
    out.push(nmeaWrap('GPGSV,1,1,04,01,68,042,45,03,44,104,42,06,31,201,38,09,22,318,35'));
    out.push(nmeaWrap('GLGSV,1,1,04,65,55,088,41,66,40,175,39,72,28,254,36,73,15,332,30'));
  } else {
    out.push(nmeaWrap(`${talker}GSV,1,1,04,01,68,042,45,03,44,104,42,06,31,201,38,09,22,318,35`));
  }
  out.push(nmeaWrap(`${talker}RMC,${t},A,${lat.dm},${lat.hemi},${lon.dm},${lon.hemi},0.00,0.00,${utcDate(now)},,,A`));
  return out.join('');
}

// ---------- simulated AT modem ----------
export function createAtState() {
  return { echo: true, buf: '' };
}

const AT_RESPONSES = {
  'AT': '',
  'ATI': 'ClearEvo DEMO Modem (simulated - not a real device)\r\nRevision: DEMO-1.0',
  'AT+CGMI': 'ClearEvo (simulated)',
  'AT+GMI': 'ClearEvo (simulated)',
  'AT+CGMM': 'HT-DEMO-56K',
  'AT+GMM': 'HT-DEMO-56K',
  'AT+CGMR': 'DEMO-1.0',
  'AT+CGSN': '358000000000000',
  'AT+CSQ': '+CSQ: 23,0',
  'AT+CREG?': '+CREG: 0,1',
  'AT+COPS?': '+COPS: 0,0,"DEMO NET TH",7',
  'AT+HELP': 'Simulated commands: AT ATI ATE0 ATE1 ATD<n> AT+CGMI AT+CGMM AT+CGMR AT+CGSN AT+CSQ AT+CREG? AT+COPS? AT+HELP',
};

// Process one complete command line -> response text ('' means bare OK)
export function atRespond(line, state) {
  const cmd = line.trim().toUpperCase();
  if (cmd === '') return '';
  if (cmd === 'ATE0') { state.echo = false; return '\r\nOK\r\n'; }
  if (cmd === 'ATE1') { state.echo = true; return '\r\nOK\r\n'; }
  if (cmd.startsWith('ATD')) return '\r\nNO CARRIER\r\n';
  if (cmd in AT_RESPONSES) {
    const body = AT_RESPONSES[cmd];
    return body ? `\r\n${body}\r\n\r\nOK\r\n` : '\r\nOK\r\n';
  }
  return '\r\nERROR\r\n';
}

// Feed raw input chars; returns text the modem sends back (echo + responses).
export function atFeed(text, state) {
  let out = '';
  for (const ch of text) {
    if (state.echo) out += ch;
    if (ch === '\r') {
      out += atRespond(state.buf, state);
      state.buf = '';
    } else if (ch === '\b' || ch === '\x7f') {
      state.buf = state.buf.slice(0, -1);
    } else if (ch !== '\n') {
      state.buf += ch;
    }
  }
  return out;
}

// ---------- SerialPort-shaped fake ----------
export const DEMO_DEVICES = {
  'demo-at': {
    label: 'DEMO: simulated AT modem',
    banner: '*** DEMO MODE - simulated AT modem, NOT a real device ***\r\n' +
            'Type AT then Enter. Try: ATI  AT+CSQ  AT+COPS?  AT+HELP\r\n\r\nOK\r\n',
  },
  'demo-ublox': {
    label: 'DEMO: simulated u-blox-like GNSS',
    banner: '*** DEMO MODE - simulated u-blox-like GNSS, NOT a real device ***\r\n' +
            '*** Fixed position: McCormick Hospital, Chiang Mai ***\r\n',
    talker: 'GN', tickMs: 1000,
  },
  'demo-mtk': {
    label: 'DEMO: simulated MTK-like GNSS',
    banner: '*** DEMO MODE - simulated MTK-like GNSS, NOT a real device ***\r\n' +
            '*** Fixed position: McCormick Hospital, Chiang Mai ***\r\n',
    talker: 'GP', tickMs: 1000,
  },
};

export class DemoPort {
  constructor(kind, tickMsOverride) {
    const dev = DEMO_DEVICES[kind];
    if (!dev) throw new Error(`unknown demo device: ${kind}`);
    this.isDemo = true;
    this.label = dev.label;
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const atState = createAtState();
    let ctrl = null, timer = 0;
    const enqueue = (text) => { try { ctrl.enqueue(enc.encode(text)); } catch {} };

    this.readable = new ReadableStream({
      start(c) { ctrl = c; },
      cancel() { clearInterval(timer); },
    });
    this.writable = new WritableStream({
      write(chunk) {
        if (!dev.talker) enqueue(atFeed(dec.decode(chunk), atState));
        // GNSS demos ignore input, like a talk-only receiver
      },
    });
    this.open = async () => {
      enqueue(dev.banner);
      if (dev.talker) {
        const tick = () => enqueue(nmeaBurst(dev.talker, new Date()));
        tick();
        timer = setInterval(tick, tickMsOverride ?? dev.tickMs);
      }
    };
    this.close = async () => {
      clearInterval(timer);
      try { ctrl.close(); } catch {}
    };
  }
}
