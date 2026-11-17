# QR Relay

QR Relay scans a QR code with the local webcam and displays a verified copy on
screen. It does not interpret QR contents.

The desktop flow uses the normal `zbarcam` preview and a separate QR image window.
Close the QR window to remove relay-owned temporary files. The optional terminal
flow opens the verified image in the system image viewer.

## Requirements

- Python 3
- `zbar` (provides `zbarcam` and `zbarimg`)
- `qrencode`
- Python GTK 4 bindings (GTK 4.8 or newer) for the desktop flow

No additional Python dependencies are required. The script does not install packages;
install the `zbar` and `qrencode` system packages through the normal package workflow.

## Run

```sh
python3 scripts/qr-relay.py --gui
python3 scripts/qr-relay.py --gui --device /dev/videoN
python3 scripts/qr-relay.py --list-cameras
python3 scripts/install-desktop.py
```

The installer creates a checkout-specific launcher under the user data directory
and links it into the applications directory. See [docs/usage.md](docs/usage.md)
for privacy, cleanup, and payload/encoding details.

## Browser-only version

The local browser version is separate from the native application. Build it with
Node.js and npm:

```sh
cd web
npm ci
npm run build
cd ..
python3 -m http.server --bind 127.0.0.1 --directory web/dist 8000
```

Open `http://127.0.0.1:8000/`, allow camera access, and select a camera to start
scanning; there is no separate Start button. Loopback HTTP is a browser secure
context, so no self-signed certificate is needed. Serving on a LAN address
requires trusted HTTPS, which QR Relay does not configure.

See [docs/web.md](docs/web.md) for browser privacy, payload-byte behavior, and
third-party notices.

The browser bundle includes these runtime dependencies:

- [jsQR 1.4.0](https://github.com/cozmo/jsQR/tree/49a9633931fb8030ac2fc9cecc121d6e5a19f9a3) (Apache-2.0; linked to its verified source commit because no release tag was confirmed). The bundle applies a tracked, source-version-guarded parser patch.
- [qrcode 1.5.4](https://github.com/soldair/node-qrcode/tree/v1.5.4) (MIT).
- [dijkstrajs 1.0.3](https://github.com/tcort/dijkstrajs/tree/v1.0.3) (MIT; bundled transitive helper used by qrcode).

[Rolldown 1.2.19](https://github.com/rolldown/rolldown/tree/v1.2.19) (MIT) is
the build engine; a small interoperability helper from it is emitted in the
browser bundle. [Vite 8.3.8](https://github.com/vitejs/vite/tree/v8.3.8) (MIT)
is build-time only. Exact npm pins are recorded in `web/package-lock.json`.
