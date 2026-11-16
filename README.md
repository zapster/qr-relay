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
