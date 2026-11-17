# QR Relay

QR Relay scans a QR code with a camera and displays a verified copy. QR
processing happens locally in this browser; the app does not interpret QR
contents or upload camera images or decoded payloads.

Hosted app: [zapster.github.io/qr-relay](https://zapster.github.io/qr-relay/).
GitHub Pages publishes the checked-in files from the repository root on `main`;
`.nojekyll` tells Pages to skip Jekyll processing.

## Run locally

From the repository root, serve the files over loopback HTTP:

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

Open `http://127.0.0.1:8000/`, allow camera access, and select a camera to start
scanning; there is no separate Start button. Loopback HTTP is a browser secure
context, so no self-signed certificate is needed. Serving on a LAN address
requires trusted HTTPS, which QR Relay does not configure.

See [docs/web.md](docs/web.md) for browser privacy, payload-byte behavior, and
third-party notices.

The browser uses these checked-in vendored dependencies:

- [jsQR 1.4.0](https://github.com/cozmo/jsQR/tree/49a9633931fb8030ac2fc9cecc121d6e5a19f9a3) (Apache-2.0; linked to its verified source commit because no release tag was confirmed). The vendored source includes a local, source-version-guarded parser patch.
- [qrcode 1.5.4](https://github.com/soldair/node-qrcode/tree/v1.5.4) (MIT).
- [dijkstrajs 1.0.3](https://github.com/tcort/dijkstrajs/tree/v1.0.3) (MIT; bundled transitive helper used by qrcode).

[Rolldown 1.2.19](https://github.com/rolldown/rolldown/tree/v1.2.19) (MIT) is
used by the optional dependency-refresh tooling; its small interoperability
helper is included in the vendored output. [Vite 8.3.8](https://github.com/vitejs/vite/tree/v8.3.8)
(MIT) is used only by that tooling. Exact npm pins are recorded in
`package-lock.json`.

## Updating vendored dependencies

Node.js and npm are only needed to refresh vendored dependencies. From the
repository root, run `npm ci` and then `npm run vendor`; review the generated
vendor files, `vendor/third-party-notices.txt`, and manifest/lockfile changes
before committing them. Updating jsQR requires reviewing its source-version
guard, parser patch, and notices; do not bypass the guard or assume an npm update
alone is sufficient.
