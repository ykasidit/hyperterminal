import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCCORMICK, nmeaChecksum, nmeaWrap, degToNmea, nmeaBurst,
  createAtState, atRespond, atFeed, DemoPort,
} from '../public/demo.js';

test('nmeaChecksum matches a known-good reference sentence', () => {
  // $GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*76 (canonical example)
  assert.equal(nmeaChecksum('GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,'), '76');
});

test('nmeaWrap produces $body*CS\\r\\n and validates', () => {
  const s = nmeaWrap('GPGLL,4916.45,N,12311.12,W,225444,A');
  assert.match(s, /^\$GPGLL.*\*[0-9A-F]{2}\r\n$/);
  const [body, cs] = s.slice(1).trimEnd().split('*');
  assert.equal(nmeaChecksum(body), cs);
});

test('degToNmea encodes McCormick Hospital coordinates', () => {
  assert.deepEqual(degToNmea(MCCORMICK.lat, false), { dm: '1847.7660', hemi: 'N' });
  assert.deepEqual(degToNmea(MCCORMICK.lon, true), { dm: '09900.4800', hemi: 'E' });
  assert.equal(degToNmea(-33.8688, false).hemi, 'S');
  assert.equal(degToNmea(-151.2, true).hemi, 'W');
});

test('nmeaBurst u-blox-like: GN talker, per-constellation GSV, McCormick fix', () => {
  const burst = nmeaBurst('GN', new Date('2026-07-21T03:00:00Z'));
  assert.match(burst, /\$GNGGA,030000\.00,1847\.7660,N,09900\.4800,E,1,/);
  assert.match(burst, /\$GPGSV,/);
  assert.match(burst, /\$GLGSV,/);
  assert.match(burst, /\$GNRMC,030000\.00,A,.*210726/);
  for (const line of burst.trimEnd().split('\r\n')) {
    const [body, cs] = line.slice(1).split('*');
    assert.equal(nmeaChecksum(body), cs, `bad checksum: ${line}`);
  }
});

test('nmeaBurst MTK-like: GP talker only', () => {
  const burst = nmeaBurst('GP', new Date('2026-07-21T03:00:00Z'));
  assert.match(burst, /\$GPGGA,/);
  assert.ok(!burst.includes('$GL'), 'MTK-like burst should not have GLONASS talker');
});

test('atRespond: basics, identity, errors', () => {
  const s = createAtState();
  assert.equal(atRespond('AT', s), '\r\nOK\r\n');
  assert.match(atRespond('ATI', s), /simulated/);
  assert.match(atRespond('at+csq', s), /\+CSQ: 23,0/);
  assert.match(atRespond('ATD0812345678', s), /NO CARRIER/);
  assert.equal(atRespond('AT+NOPE', s), '\r\nERROR\r\n');
});

test('atFeed: echo, line assembly, ATE0 disables echo', () => {
  const s = createAtState();
  assert.equal(atFeed('AT\r', s), 'AT\r\r\nOK\r\n');       // echoed + OK
  atFeed('ATE0\r', s);
  assert.equal(s.echo, false);
  assert.equal(atFeed('AT\r', s), '\r\nOK\r\n');           // no echo now
});

test('atFeed: backspace edits the pending command', () => {
  const s = createAtState();
  const out = atFeed('ATX\bI\r', s); // ATX <backspace> I = ATI
  assert.match(out, /DEMO Modem/);
});

test('DemoPort AT modem: end-to-end write AT, read OK', async () => {
  const port = new DemoPort('demo-at');
  await port.open();
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const dec = new TextDecoder();
  let acc = dec.decode((await reader.read()).value); // banner
  assert.match(acc, /DEMO MODE - simulated AT modem/);
  await writer.write(new TextEncoder().encode('ATI\r'));
  while (!/DEMO Modem[\s\S]*OK/.test(acc)) {
    acc += dec.decode((await reader.read()).value);
  }
  await port.close();
});

test('DemoPort GNSS: banner then valid burst at McCormick', async () => {
  const port = new DemoPort('demo-ublox', 999999); // one immediate tick only
  await port.open();
  const reader = port.readable.getReader();
  const dec = new TextDecoder();
  let acc = '';
  while (!acc.includes('$GNRMC')) {
    acc += dec.decode((await reader.read()).value);
  }
  assert.match(acc, /DEMO MODE - simulated u-blox-like GNSS/);
  assert.match(acc, /McCormick Hospital, Chiang Mai/);
  assert.match(acc, /1847\.7660,N,09900\.4800,E/);
  await port.close();
});
