# hyperterminal.clearevo.com

HyperTerminal-style web serial terminal. Pure static frontend (vanilla JS + xp.css),
deployed as a Cloudflare Workers static-assets site via wrangler.

- `public/` is the whole site; `public/logic.js` is pure logic (unit-tested), `public/app.js` is DOM + Web Serial.
- `./test.sh` runs `node --test` against `test/logic.test.js`. Keep new pure logic in `logic.js` so it stays testable.
- Deploy: `./push.sh` (wrangler deploy; custom domain is declared in `wrangler.jsonc` routes).
- No build step, no framework, no bundler. Keep it that way.

## Future: WASM protocol decoder pane (research notes, 2026-07-21)

Goal: live-decode binary GNSS/UBX frames beside the raw terminal — a feature no
competing web serial terminal has. Source: `ykasidit/bluetooth_gnss` master, `rust/` crate
(`rust_lib_bluetooth_gnss`).

What's there (master, commit 9f20748 "refactor Rust parser: handle-based State, remove
global mutexes and external deps"):

- Dependencies: `binrw 0.14` (declarative binary parsing — this is the "standard" kampu
  replacement), `nmea 0.7` (serde feature), `serde_json`, `anyhow` — **all pure Rust,
  wasm32-unknown-unknown compatible**.
- Non-portable deps: `jni 0.8` (Android entry points in `lib.rs`) and
  `flutter_rust_bridge 2.11.1` (`frb_generated.rs`, `api/`). These are bindings only,
  not parser logic.
- Parser modules (~2,300 lines total):
  - `parser.rs` (311 L) — `feed_and_parse` streaming entry point over a `VecDeque<u8>` buffer
  - `protocol.rs` — `ProtocolHint` auto-detection
  - `nmea_parser.rs` (475 L), `gnss_parser.rs` (408 L)
  - `ubx_parser.rs` (214 L) — u-blox UBX via binrw
  - `qstarz_parser.rs` (397 L) — Qstarz binary via binrw
- The handle-based `State` refactor on master (no global mutexes, no globals) is exactly
  the shape WASM needs.

Port plan (~1 focused day):
1. Cargo feature `wasm`: gate out `jni` + `flutter_rust_bridge` deps and `lib.rs` JNI fns.
2. Thin `wasm-bindgen` wrapper: `new_state() -> handle`, `feed(handle, &[u8]) -> String` (JSON out via the existing serde_json path).
3. `wasm-pack build --target web`, drop the pkg into `public/`, wire the terminal read
   loop to also feed the decoder when a "decode" pane is enabled.

Prior web-serial art in that repo: branch `origin/isolate` — `lib/serial_transport.dart`
(Dart JS-interop Web Serial reader loop) + `lib/main_web.dart`. Pattern reference only;
superseded by the simpler vanilla JS in this repo.
