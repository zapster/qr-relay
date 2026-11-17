# Browser-only QR Relay

The browser application consists of files at the repository root and scans QR
codes to display verified copies, with QR processing performed locally in this
browser. It uses the browser camera API, native HTML/CSS/JavaScript modules, and
checked-in vendored QR libraries. Camera access requires a secure context;
`localhost` and `127.0.0.1` over HTTP are secure contexts in supported browsers.
A non-loopback LAN address requires trusted HTTPS. This project does not create
certificates, configure HTTPS, or install system packages.

## Run locally

From the repository root, serve the files over loopback HTTP:

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

Open `http://127.0.0.1:8000/` and grant camera permission when prompted.
Node.js and npm are not needed to serve or use the site. GitHub Pages publishes
the checked-in files from the repository root on `main`; the root `.nojekyll`
file skips Jekyll processing. The site loads its checked-in scripts from the
same origin, without a CDN or package-registry requests. The local server serves
these files, and the browser uses its camera API. No camera image or decoded
payload is uploaded by the app.

## Updating vendored dependencies

Node.js and npm are needed only when refreshing vendored dependencies. From the
repository root, run `npm ci` and then `npm run vendor`. Review the generated
vendor output, third-party notices, and manifest/lockfile changes before
committing them. The vendored jsQR source has a source-version guard for its
local parser patch; a jsQR update requires reviewing the guard, patch, and
notices rather than bypassing the guard or relying on an npm update alone.
Vite and Rolldown are used by the optional dependency-refresh tooling, not to
build the site for serving or publishing.

## Camera and privacy

The browser presents an explicit camera chooser. If camera labels are
unavailable, opening that chooser may start a temporary permission probe,
enumerate devices while the probe is active, and then stop the probe tracks.
The probe is not used as the scan camera: selecting a listed camera immediately
starts the scan, with no separate Start button. Starting another camera replaces
the previously owned stream; stopping or canceling also stops owned tracks.
Device labels and choices are memory-only. Camera access can be revoked in
browser site permissions. If the selected scan stream ends externally, the
camera core stops and detaches it before invoking its optional `onEnded`
callback; intentional cleanup and probe-stream endings do not trigger it.

The application does not access the clipboard, persist camera preferences, or
send camera frames or QR payload bytes over the network. Serving the local page
and its same-origin assets does create ordinary HTTP requests to the local
server. Browser extensions and browser-managed permissions/history are outside
the app's control.

## QR payload fidelity

The vendored jsQR 1.4.0 source includes a local parser patch, guarded by the
expected source version. It accepts Numeric, Alphanumeric, Byte, and Kanji
segments with valid ECI prefixes, rejects unsupported modes (including
Structured Append, FNC1, and Hanzi/reserved modes), and rejects malformed or
truncated ECI prefixes instead of accepting partial data. This is a local
parser guard; it is not behavior supplied by upstream jsQR, and it does not
claim comprehensive validation of all ECI assignment numbers.

The app compares the decoder-reported payload bytes with a second decode of the
generated image using the same decoder. It does not convert QR data through
text decoding. Agreement verifies only the decoder-reported bytes, not the
source symbol's bitstream or semantics. Original mode/ECI metadata is not
retained; Kanji data is returned as Shift-JIS bytes and may be interpreted
differently by a downstream application. A payload that exceeds QR byte-mode
capacity fails rather than displaying an unverified image.

Frame sampling is capped at a maximum dimension of 1280 pixels and is scheduled
about every 120 ms, but decoding itself is synchronous on the main thread and
has no hard time limit. A complex frame may briefly delay UI actions such as
Cancel; enforcing a hard deadline would require moving decoding to a worker.

## Content security and offline behavior

The site's HTML, CSS, JavaScript modules, and vendored dependencies use relative
URLs and are served from the same origin. The implementation does not require a
runtime CDN, `eval`, or inline script. A restrictive same-origin content
security policy is used by the page. An offline-capable PWA/service worker is
intentionally deferred.

## Third-party code

The checked-in vendor files include jsQR 1.4.0 (Apache License 2.0), qrcode
1.5.4 and dijkstrajs 1.0.3 (MIT), and a Rolldown 1.2.19 interoperability helper
(MIT). Vite 8.3.8 is used only by optional dependency-refresh tooling. The
`vendor/third-party-notices.txt` file includes the package licenses and
applicable source attributions.
