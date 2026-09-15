// HyperTerminal by ClearEvo.com - logic.js
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

// Pure terminal/formatting logic - no DOM, unit-tested in test/logic.test.js

// Dumb-TTY screen model: lines of text, cursor row/col, overwrite semantics.
// ponytail: full re-render string model, O(lines) per feed; switch to row-dirty
// rendering if high-baud streams ever lag.
export function createTerm(maxLines = 5000) {
  return { lines: [''], row: 0, col: 0, maxLines };
}

export function feed(term, text) {
  for (const ch of text) {
    if (ch === '\r') {
      term.col = 0;
    } else if (ch === '\n') {
      term.row++;
      while (term.lines.length <= term.row) term.lines.push('');
    } else if (ch === '\b') {
      if (term.col > 0) term.col--;
    } else if (ch === '\t') {
      term.col = (term.col & ~7) + 8;
    } else if (ch === '\x07' || ch === '\x00') {
      // bell / NUL: ignore
    } else {
      const line = term.lines[term.row] ?? '';
      const padded = line.length < term.col ? line + ' '.repeat(term.col - line.length) : line;
      term.lines[term.row] = padded.slice(0, term.col) + ch + padded.slice(term.col + 1);
      term.col++;
    }
  }
  if (term.lines.length > term.maxLines) {
    const drop = term.lines.length - term.maxLines;
    term.lines.splice(0, drop);
    term.row = Math.max(0, term.row - drop);
  }
}

export function getText(term) {
  return term.lines.join('\n');
}

export function clearTerm(term) {
  term.lines = [''];
  term.row = 0;
  term.col = 0;
}

// "115200 8-N-1" like the HyperTerminal status bar
export function formatPortSettings({ baudRate, dataBits, parity, stopBits }) {
  const p = { none: 'N', even: 'E', odd: 'O' }[parity] || '?';
  return `${baudRate} ${dataBits}-${p}-${stopBits}`;
}

// "0:00:00" connected timer like the HyperTerminal status bar
export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ASCII Setup: "Send line ends with line feeds" (outgoing CR -> CRLF)
export function outTransform(text, { sendLineEndsWithLf = false } = {}) {
  if (!sendLineEndsWithLf) return text;
  return text.replace(/\r(?!\n)/g, '\r\n');
}

// ASCII Setup: "Append line feeds to incoming line ends" (incoming CR -> CRLF).
// Stateful because a CR can be the last byte of one chunk and its LF the
// first byte of the next.
export function createInTransform(opts = {}) {
  let pendingCR = false;
  return function transform(text) {
    if (!opts.appendLfToIncoming) return text;
    let out = '';
    if (pendingCR) {
      if (text[0] !== '\n') out += '\n';
      pendingCR = false;
    }
    out += text.replace(/\r(?!\n)/g, (m, off) => (off === text.length - 1 ? m : '\r\n'));
    if (text.endsWith('\r')) pendingCR = true;
    return out;
  };
}
