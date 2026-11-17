# QR Relay

QR Relay scans QR codes with your camera and displays a verified copy. QR
processing happens locally in the browser; the app does not upload camera
images or decoded payloads.

Hosted app: [zapster.github.io/qr-relay](https://zapster.github.io/qr-relay/).
GitHub Pages publishes the checked-in files from the repository root on `main`;
the root `.nojekyll` file skips Jekyll processing. This is a static site with no
page-build step.

## Run locally

From the repository root, serve the files over loopback HTTP:

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

Open `http://127.0.0.1:8000/`, grant camera permission, and select a camera to
start scanning. Camera access requires HTTPS or loopback HTTP such as
`127.0.0.1`. Node.js and npm are not needed to run the site.

## QR data and privacy

Camera frames and decoded QR bytes are processed locally; they are not uploaded
or stored by the app. The app compares the decoder-reported bytes with a second
decode of its generated image using the same decoder. This does not independently
verify the original symbol's bitstream or semantics. Original mode and ECI
metadata are not retained; Kanji payloads are returned as Shift-JIS bytes and
may be interpreted differently downstream.

The local jsQR patch accepts Numeric, Alphanumeric, Byte, and Kanji segments;
rejects unsupported modes including Structured Append, FNC1, and Hanzi/reserved
modes; and rejects malformed or truncated ECI prefixes. It does not validate
all ECI assignment numbers. Payloads exceeding QR byte-mode capacity fail
rather than displaying an unverified image. Decoding is synchronous on the main
thread and complex frames may briefly delay controls.

## Vendored dependencies

- [`vendor/jsQR.js`](vendor/jsQR.js): Published jsQR 1.4.0 UMD file from [verified source commit](https://github.com/cozmo/jsQR/tree/49a9633931fb8030ac2fc9cecc121d6e5a19f9a3) (Apache-2.0; no release tag was confirmed), preserved byte-for-byte except for the documented local strict-parser patch and modification notice.
- [`vendor/qrcode.js`](vendor/qrcode.js): Generated browser module from [qrcode 1.5.4](https://github.com/soldair/node-qrcode/tree/v1.5.4) (MIT); includes [dijkstrajs 1.0.3](https://github.com/tcort/dijkstrajs/tree/v1.0.3) (MIT) and Rolldown helpers.

[Vite 8.3.8](https://github.com/vitejs/vite/tree/v8.3.8) and
[Rolldown 1.2.19](https://github.com/rolldown/rolldown/tree/v1.2.19) are used
only by optional dependency-refresh tooling to prepare qrcode. Rolldown helpers
are included in `vendor/qrcode.js`; neither tool builds or transforms the app
or jsQR. Exact npm pins are in `package-lock.json`. Full license and source
attributions are in [`vendor/third-party-notices.txt`](vendor/third-party-notices.txt).

To refresh the vendor files, run `npm ci` then `npm run vendor` from the
repository root. Review the generated files, notices, and manifest/lockfile
changes before committing. The jsQR refresh uses the hash/version guard in
[`scripts/strict-jsqr.js`](scripts/strict-jsqr.js); if the upstream source
changes, review the guard and patch manually. Never bypass the guard or assume
an npm update alone is sufficient.

## License

Original QR Relay code is licensed under the [MIT License](LICENSE).
Vendored dependencies retain their respective licenses; see the
[third-party notices](vendor/third-party-notices.txt).
