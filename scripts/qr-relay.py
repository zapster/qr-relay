#!/usr/bin/env python3
"""One-shot, byte-preserving QR camera-to-screen relay."""

import argparse
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import tempfile


class RelayError(RuntimeError):
    """A concise, user-facing relay failure."""


class ScanCancelled(Exception):
    """The scanner exited successfully without capturing a payload."""


def camera_devices(sysfs="/sys/class/video4linux", dev_root="/dev"):
    """List index-zero video nodes from metadata only; this is a capture heuristic."""
    found = []
    for name_file in sorted(Path(sysfs).glob("video*/name")):
        node_name = name_file.parent.name
        index_file = name_file.parent / "index"
        try:
            index = int(index_file.read_text().strip())
            name = name_file.read_text().strip()
        except (OSError, ValueError):
            continue
        if index != 0:
            continue
        device = str(Path(dev_root) / node_name)
        found.append({"name": name or node_name, "device": device})
    return found


def select_camera(cameras, input_fn=input):
    if not cameras:
        raise RelayError("no usable camera found; connect a camera or use --device PATH")
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RelayError("camera selection needs an interactive terminal; use --device PATH")
    print("Choose a camera:")
    for number, camera in enumerate(cameras, 1):
        print(f"  {number}. {camera['name']} ({camera['device']})")
    try:
        choice = input_fn(f"Camera [1-{len(cameras)}]: ").strip()
    except EOFError:
        raise
    if not choice.isdecimal() or not 1 <= int(choice) <= len(cameras):
        raise RelayError("invalid camera choice")
    camera = cameras[int(choice) - 1]
    print(f"Using camera: {camera['name']} ({camera['device']})")
    return camera


def private_temp_parent():
    """Choose a trusted per-user runtime directory for sensitive QR bytes."""
    candidates = []
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if runtime:
        candidates.append(Path(runtime))
    for path in candidates:
        try:
            info = path.lstat()
        except OSError:
            continue
        if (stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
                and stat.S_IMODE(info.st_mode) & 0o077 == 0):
            return path
    return None


def run(argv, *, timeout, stdout=subprocess.PIPE):
    """Run a native tool without a shell and keep binary output binary."""
    try:
        return subprocess.run(argv, stdout=stdout, stderr=subprocess.PIPE,
                              timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RelayError(f"{Path(argv[0]).name} timed out") from exc
    except OSError as exc:
        raise RelayError(f"could not run {Path(argv[0]).name}: {exc.strerror}") from exc


def require_tools(names):
    found = {}
    missing = []
    for name in names:
        path = shutil.which(name)
        if path:
            found[name] = path
        else:
            missing.append(name)
    if missing:
        raise RelayError("missing required tools: " + ", ".join(missing)
                         + "; check zbar, qrencode, and the desktop opener are available on PATH")
    return found


def scan_args(zbarcam, device):
    return [zbarcam, "--quiet", "--nodbus", "--raw", "--oneshot",
            "-Sdisable", "-Sqrcode.enable=1", "-Sqrcode.binary=1", device]


def decode_args(zbarimg, image):
    return [zbarimg, "--quiet", "--nodbus", "--raw", "--oneshot",
            "-Sdisable", "-Sqrcode.enable=1", "-Sqrcode.binary=1", str(image)]


def capture_and_verify(tools, payload_path, image_path, device, timeout, runner=run):
    """Capture raw bytes, encode, then require exact separate ZBar decode equality."""
    with payload_path.open("wb") as payload_file:
        os.chmod(payload_path, 0o600)
        result = runner(scan_args(tools["zbarcam"], device),
                        timeout=timeout, stdout=payload_file)
    if result.returncode:
        raise RelayError(f"camera scan failed (exit {result.returncode})")
    payload = payload_path.read_bytes()
    if not payload:
        raise ScanCancelled()

    result = runner([tools["qrencode"], "-8", "-s", "12", "-r", str(payload_path),
                     "-o", str(image_path)], timeout=timeout)
    if result.returncode:
        raise RelayError(f"QR image generation failed (exit {result.returncode})")
    if not image_path.is_file() or image_path.stat().st_size == 0:
        raise RelayError("QR image generator produced no image")
    os.chmod(image_path, 0o600)

    result = runner(decode_args(tools["zbarimg"], image_path), timeout=timeout)
    if result.returncode:
        raise RelayError(f"generated QR verification failed (exit {result.returncode})")
    if result.stdout != payload:
        raise RelayError("generated QR did not decode to the exact captured bytes")
    return len(payload)


def launch_viewer(viewer, image):
    """Launch the configured desktop handler without capturing its output or imposing a timeout."""
    try:
        result = subprocess.run([viewer, str(image)], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, check=False)
    except OSError as exc:
        raise RelayError(f"could not run {Path(viewer).name}: {exc.strerror}") from exc
    if result.returncode:
        raise RelayError(f"could not open QR image (exit {result.returncode})")


def relay(device, timeout):
    tools = require_tools(("zbarcam", "qrencode", "zbarimg", "xdg-open"))
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RelayError("run from an interactive terminal")

    with tempfile.TemporaryDirectory(prefix="qr-relay-", dir=private_temp_parent()) as temp:
        root = Path(temp)
        payload_path = root / "payload"
        image_path = root / "qr.png"
        count = capture_and_verify(tools, payload_path, image_path, device, timeout)
        print(f"Verified QR image ({count} payload bytes). Scan it with the other device.")
        print("Close the image viewer when done; press Enter afterward to remove relay temp files.")
        launch_viewer(tools["xdg-open"], image_path)
        input()
    print("Temporary QR data removed.")


def gui_application():
    import gi
    gi.require_version("Gtk", "4.0")
    from gi.repository import Gio, Gtk

    if Gtk.get_major_version() < 4 or (Gtk.get_major_version() == 4 and Gtk.get_minor_version() < 8):
        raise RelayError("GTK 4.8 or newer is required")
    app = Gtk.Application(application_id="cc.zapster.qr-relay",
                          flags=Gio.ApplicationFlags.NON_UNIQUE)
    return app, Gtk


def close_gui_window(application, window):
    window.destroy()
    application.quit()


def run_gui_application(app, activate):
    errors = []
    def guarded_activate(application):
        try:
            activate(application)
        except Exception as exc:
            errors.append(exc)
            application.quit()
    app.connect("activate", guarded_activate)
    try:
        status = app.run([])
    finally:
        for window in list(app.get_windows()):
            window.destroy()
    if errors:
        raise errors[0]
    if status:
        raise RelayError(f"desktop application failed (exit {status})")

def gui_choose_camera(cameras):
    if not cameras:
        raise RelayError("No usable camera was found. Connect a camera and try again.")
    app, Gtk = gui_application()
    result = {"camera": None}

    def activate(application):
        window = Gtk.ApplicationWindow(application=application)
        window.set_title("Choose a camera")
        window.set_default_size(420, 180)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box.set_margin_top(20); box.set_margin_bottom(20)
        box.set_margin_start(20); box.set_margin_end(20)
        box.append(Gtk.Label(label="Choose a camera to scan with:", xalign=0))
        rows = [f"{camera['name']} ({camera['device']})" for camera in cameras]
        model = Gtk.StringList.new(rows)
        picker = Gtk.DropDown(model=model)
        picker.set_selected(0)
        box.append(picker)
        buttons = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8,
                          halign=Gtk.Align.END)
        cancel = Gtk.Button(label="Cancel")
        scan = Gtk.Button(label="Scan")
        cancel.connect("clicked", lambda *_: close_gui_window(application, window))
        def accept(*_):
            result["camera"] = cameras[picker.get_selected()]
            close_gui_window(application, window)
        scan.connect("clicked", accept)
        buttons.append(cancel); buttons.append(scan); box.append(buttons)
        window.set_child(box)
        window.connect("close-request",
                       lambda *_: (close_gui_window(application, window), True)[1])
        window.present()
    run_gui_application(app, activate)
    return result["camera"]


def gui_message(title, message, *, error=False):
    try:
        app, Gtk = gui_application()
    except (ImportError, ValueError, TypeError, RuntimeError, OSError, RelayError):
        try:
            if shutil.which("zenity"):
                result = subprocess.run(["zenity", "--error" if error else "--info",
                            "--title", title, "--text", message],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                           check=False)
                if result.returncode:
                    print(f"qr-relay: {message}", file=sys.stderr)
            else:
                print(f"qr-relay: {message}", file=sys.stderr)
        except OSError:
            print(f"qr-relay: {message}", file=sys.stderr)
        return
    def activate(application):
        window = Gtk.ApplicationWindow(application=application)
        window.set_title(title)
        window.set_default_size(420, 160)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=16)
        box.set_margin_top(22); box.set_margin_bottom(22)
        box.set_margin_start(22); box.set_margin_end(22)
        box.append(Gtk.Label(label=message, wrap=True, xalign=0))
        button = Gtk.Button(label="Close", halign=Gtk.Align.END)
        button.connect("clicked", lambda *_: close_gui_window(application, window))
        box.append(button); window.set_child(box)
        window.connect("close-request",
                       lambda *_: (close_gui_window(application, window), True)[1])
        window.present()
    run_gui_application(app, activate)


def gui_show_qr(image):
    app, Gtk = gui_application()
    def activate(application):
        window = Gtk.ApplicationWindow(application=application)
        window.set_title("QR Relay")
        window.set_default_size(680, 760)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        box.set_margin_top(16); box.set_margin_bottom(16)
        box.set_margin_start(16); box.set_margin_end(16)
        note = Gtk.Label(label="Scan this QR code with another device.",
                         wrap=True, xalign=0)
        picture = Gtk.Picture.new_for_filename(str(image))
        picture.set_can_shrink(True)
        picture.set_content_fit(Gtk.ContentFit.CONTAIN)
        picture.set_hexpand(True); picture.set_vexpand(True)
        box.append(note); box.append(picture)
        close = Gtk.Button(label="Done")
        close.set_halign(Gtk.Align.END)
        close.connect("clicked", lambda *_: close_gui_window(application, window))
        box.append(close)
        window.set_child(box)
        window.connect("close-request",
                       lambda *_: (close_gui_window(application, window), True)[1])
        window.present()
    run_gui_application(app, activate)


def gui_relay(timeout=120, device=None):
    try:
        camera = ({"name": device, "device": device}
                  if device is not None else
                  gui_choose_camera(camera_devices()))
        if camera is None:
            return 0
        tools = require_tools(("zbarcam", "qrencode", "zbarimg"))
        with tempfile.TemporaryDirectory(prefix="qr-relay-", dir=private_temp_parent()) as temp:
            root = Path(temp)
            payload, image = root / "payload", root / "qr.png"
            try:
                capture_and_verify(tools, payload, image, camera["device"], timeout)
            except ScanCancelled:
                return 0
            gui_show_qr(image)
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        print(f"qr-relay: {exc}", file=sys.stderr)
        try:
            gui_message("QR Relay", str(exc), error=True)
        except Exception:
            pass
        return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", help="use this camera device directly, without camera discovery")
    parser.add_argument("--list-cameras", action="store_true", help="list camera names without activating them")
    parser.add_argument("--gui", action="store_true", help="run the complete desktop workflow")
    parser.add_argument("--timeout", type=int, default=120, help="per-tool timeout in seconds (default: 120)")
    args = parser.parse_args(argv)
    if args.timeout < 1:
        parser.error("--timeout must be at least 1 second")

    previous = signal.getsignal(signal.SIGTERM)
    previous_umask = os.umask(0o077)
    try:
        signal.signal(signal.SIGTERM,
                      lambda signum, frame: (_ for _ in ()).throw(KeyboardInterrupt()))
        if args.list_cameras:
            cameras = camera_devices()
            if not cameras:
                raise RelayError("no usable camera found")
            for camera in cameras:
                print(f"{camera['name']} ({camera['device']})")
        elif args.gui:
            return gui_relay(args.timeout, args.device)
        else:
            device = args.device
            if device is None:
                camera = select_camera(camera_devices())
                device = camera["device"]
            relay(device, args.timeout)
    except ScanCancelled:
        return 0
    except (RelayError, KeyboardInterrupt, EOFError) as exc:
        if isinstance(exc, KeyboardInterrupt):
            print("Interrupted; temporary QR data removed.", file=sys.stderr)
            return 130
        if isinstance(exc, EOFError):
            print("Input ended; temporary QR data removed.", file=sys.stderr)
            return 1
        print(f"qr-relay: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"qr-relay: {exc.strerror}", file=sys.stderr)
        return 1
    finally:
        os.umask(previous_umask)
        signal.signal(signal.SIGTERM, previous)
    return 0


if __name__ == "__main__":
    sys.exit(main())
