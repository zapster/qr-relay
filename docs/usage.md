# QR webcam-to-screen relay

`scripts/qr-relay.py` is a one-shot wrapper using native `zbarcam`, `qrencode`,
and `zbarimg` tools. The `--gui` desktop flow shows the QR in a GTK window; the
legacy terminal flow opens the verified PNG in `xdg-open` (optional).
Neither flow interprets QR content, accesses the clipboard, or intentionally
transmits data.

```text
python3 scripts/qr-relay.py --gui
python3 scripts/qr-relay.py [--device /dev/videoN] [--timeout 120]
python3 scripts/qr-relay.py --list-cameras
python3 scripts/install-desktop.py
```

Unless `--device PATH` is supplied, the application presents a camera chooser
on each run. `--list-cameras` only reads device metadata. Camera discovery uses
Linux video metadata and does not activate a camera; its index-zero choice is a
heuristic, not a capability check. The camera preview remains ZBar's normal
preview. After a verified scan, close the QR window to remove the private
temporary files.
The QR is displayed large with a white quiet zone. Scan it with another device.
The decoded QR contents are not shown as text.

The wrapper captures raw scanner stdout to a private temporary payload, encodes
it to a larger PNG (12 pixels per QR module), and performs a separate ZBar
decode pass. The GUI displays its QR only after decoded bytes exactly match the
captured bytes and the camera process has exited. In terminal mode, close the
external viewer and press Enter for cleanup. Temporary files use a valid private
`XDG_RUNTIME_DIR` when available or a secure system temporary directory
otherwise. The wrapper removes its files on normal completion, errors, Ctrl-C,
and TERM; SIGKILL or a system crash can prevent cleanup. An external viewer may
retain history or thumbnails and is not sandboxed by the wrapper.

The comparison promises payload-byte preservation, not reproduction of the
original QR symbol's mode, ECI, segmentation, or other encoding metadata.

The required tools are provided by the `zbar` and `qrencode` packages; the
script does not install packages. The desktop flow requires GTK 4.8 or newer
Python bindings. The installer renders a launcher for this checkout at
`$XDG_DATA_HOME/cc.zapster.qr-relay/cc.zapster.qr-relay.desktop` (or
`~/.local/share/...` when `XDG_DATA_HOME` is unset/empty) and creates an
applications-directory symlink named `cc.zapster.qr-relay.desktop`. It only
removes the old `qr-relay.desktop` applications symlink when it points exactly
to this checkout's former desktop file; unrelated entries are left untouched.
If `XDG_DATA_HOME` is set, it must be an absolute path.
