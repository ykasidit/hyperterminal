# HyperTerminal online

A tribute to the long-lost Windows HyperTerminal, rebuilt as a pure-frontend web serial
terminal on the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API).

Live at **https://hyperterminal.clearevo.com**

- Talk to COM ports / USB-serial adapters (CH340, CP210x, FTDI, PL2303...) straight from the browser
- Classic HyperTerminal UI: menu bar, COM Properties dialog (baud/data/parity/stop/flow), ASCII Setup, status bar with connect timer and `115200 8-N-1`
- Capture Text to a downloadable `.txt`, Send Text File, local echo, CR/LF options
- Copy/paste friendly: select text freely (rendering pauses while you select), `Ctrl+C` copies selection (sends `^C` when nothing is selected), `Ctrl+V`/right-click pastes to host
- 100% client-side - nothing ever leaves your machine
- Chrome / Edge on desktop for real ports (Firefox and Safari have no Web Serial API)
- **DEMO simulated devices** (File > Properties > Connect using) - clearly marked, not real
  hardware: an AT-command modem, a u-blox-like GNSS and an MTK-like GNSS, both GNSS demos
  fixed at McCormick Hospital, Chiang Mai. Work in any browser, no hardware needed.

## Dev

No build step. Vanilla JS + [xp.css](https://botoxparty.github.io/XP.css/) (vendored).

```
./test.sh            # unit tests (node --test) for the pure logic in public/logic.js
npx wrangler dev     # local dev server
./build.sh           # syntax check + tests
./push.sh            # deploy to Cloudflare (custom domain in wrangler.jsonc)
./build_and_push.sh  # all of the above
```

Not implemented (the original had them): Zmodem/Xmodem/Ymodem/Kermit file transfer,
printing, Wait for a Call (browsers can't listen for incoming serial calls).

## License

GPL v2, like the [Bluetooth GNSS](https://github.com/ykasidit/bluetooth_gnss) app - see [LICENSE](LICENSE).
