# Browser-only QR Relay

The `web/` application is a local-only browser companion to the native QR Relay.
It uses the browser camera API and packages its QR encoder and decoder into the
site at build time. Camera access requires a secure context; `localhost` and
`127.0.0.1` over HTTP are secure contexts in supported browsers. A non-loopback
LAN address requires trusted HTTPS. This project does not create certificates,
configure HTTPS, or install system packages.

## Build and serve

Install Node.js and npm using the normal trusted toolchain for your platform:

```sh
cd web
npm ci
npm run build
cd ..
python3 -m http.server --bind 127.0.0.1 --directory web/dist 8000
```

Open `http://127.0.0.1:8000/` and grant camera permission when prompted.
`npm run build` is a build-time requirement only; Node.js and npm are not needed
to use the built site. The site does not use a CDN or fetch QR libraries at
runtime. The local HTTP server serves the site's bundled assets, and the browser
uses its camera API. No camera image or decoded payload is uploaded by the app.

## Camera and privacy

The browser presents an explicit camera chooser before starting a scan. If
camera labels are unavailable, opening that chooser may start a temporary
permission probe, enumerate devices while the probe is active, and then stop
the probe tracks. The probe is not used as the scan camera; the user selects
the camera for the actual scan. Starting a scan replaces the previously owned
stream; stopping or canceling also stops owned tracks. Device labels and choices
are memory-only. Camera access can be revoked in browser site permissions. If
the selected scan stream ends externally, the camera core stops and detaches it
before invoking its optional `onEnded` callback; intentional cleanup and probe
stream endings do not trigger that callback.

The application does not access the clipboard, persist camera preferences, or
send camera frames or QR payload bytes over the network. Serving the local page
and its same-origin assets does create ordinary HTTP requests to the local
server. Browser extensions and browser-managed permissions/history are outside
the app's control.

## QR payload fidelity

The app compares the decoder-reported payload bytes with a second decode of the
generated image. It does not convert QR data through text decoding. This check
concerns the decoder's reported bytes; it does not establish the original
symbol's underlying bitstream, ECI assignment, segmentation, mode bits, or other
encoding metadata. A payload that exceeds QR byte-mode capacity fails clearly
rather than displaying an unverified image.

## Content security and offline behavior

Production assets are bundled with relative URLs and are served from the same
origin. The implementation does not require a runtime CDN, `eval`, or inline
script. A restrictive same-origin content security policy is used by the page.
An offline-capable PWA/service worker is intentionally deferred.

## Third-party code

The browser bundle uses jsQR 1.4.0 (Apache License 2.0) and qrcode 1.5.4 (MIT).
The published site must include the full license texts and required notices
from these exact package sources, plus any bundled transitive dependency notices.
