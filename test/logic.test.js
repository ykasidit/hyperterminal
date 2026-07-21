import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTerm, feed, getText, clearTerm,
  formatPortSettings, formatDuration,
  outTransform, createInTransform,
} from '../public/logic.js';

test('CRLF lines render normally', () => {
  const t = createTerm();
  feed(t, 'hello\r\nworld\r\n');
  assert.equal(getText(t), 'hello\nworld\n');
});

test('LF-only input staircases (authentic dumb TTY)', () => {
  const t = createTerm();
  feed(t, 'ab\ncd');
  assert.equal(getText(t), 'ab\n  cd');
});

test('CR overwrites line (progress-bar style)', () => {
  const t = createTerm();
  feed(t, 'progress 10%\rprogress 99%');
  assert.equal(getText(t), 'progress 99%');
});

test('backspace moves cursor back and overwrites', () => {
  const t = createTerm();
  feed(t, 'abc\b\bXY');
  assert.equal(getText(t), 'aXY');
});

test('tab advances to next 8-column stop', () => {
  const t = createTerm();
  feed(t, 'ab\tX');
  assert.equal(getText(t), 'ab      X');
});

test('scrollback capped at maxLines', () => {
  const t = createTerm(10);
  for (let i = 0; i < 25; i++) feed(t, `line${i}\r\n`);
  assert.equal(t.lines.length, 10);
  assert.ok(getText(t).includes('line24'));
  assert.ok(!getText(t).includes('line14'));
});

test('clearTerm resets screen', () => {
  const t = createTerm();
  feed(t, 'junk\r\nmore');
  clearTerm(t);
  assert.equal(getText(t), '');
  feed(t, 'fresh');
  assert.equal(getText(t), 'fresh');
});

test('formatPortSettings matches status bar format', () => {
  assert.equal(formatPortSettings({ baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1 }), '115200 8-N-1');
  assert.equal(formatPortSettings({ baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 2 }), '9600 7-E-2');
});

test('formatDuration matches status bar format', () => {
  assert.equal(formatDuration(0), '0:00:00');
  assert.equal(formatDuration(3723), '1:02:03');
  assert.equal(formatDuration(45296), '12:34:56');
});

test('outTransform appends LF to CR only when enabled', () => {
  assert.equal(outTransform('AT\r', { sendLineEndsWithLf: true }), 'AT\r\n');
  assert.equal(outTransform('AT\r', { sendLineEndsWithLf: false }), 'AT\r');
  assert.equal(outTransform('AT\r\n', { sendLineEndsWithLf: true }), 'AT\r\n');
});

test('createInTransform appends LF, including CR split across chunks', () => {
  const tf = createInTransform({ appendLfToIncoming: true });
  assert.equal(tf('a\rb'), 'a\r\nb');
  assert.equal(tf('x\r'), 'x\r');       // trailing CR deferred
  assert.equal(tf('y'), '\ny');         // LF inserted on next chunk
  const tf2 = createInTransform({ appendLfToIncoming: true });
  assert.equal(tf2('x\r'), 'x\r');
  assert.equal(tf2('\ny'), '\ny');      // already CRLF across chunks: no double LF
});

test('createInTransform is a no-op when disabled', () => {
  const tf = createInTransform({});
  assert.equal(tf('a\rb\r'), 'a\rb\r');
});
