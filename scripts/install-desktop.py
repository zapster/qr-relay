#!/usr/bin/env python3
"""Install the per-checkout QR Relay desktop launcher for the current user."""

import argparse
import os
from pathlib import Path
import sys
import tempfile
import unicodedata


APP_ID = "cc.zapster.qr-relay"
TEMPLATE_NAME = f"{APP_ID}.desktop.in"
ENTRY_NAME = f"{APP_ID}.desktop"
LEGACY_NAME = "qr-relay.desktop"


def exec_argument(value: str) -> str:
    """Encode one argument for Desktop Entry Exec's two escaping layers."""
    if any(unicodedata.category(char) == "Cc" for char in value):
        raise ValueError("paths containing control characters cannot be used in Exec")

    # First quote for the Exec command-line grammar, then escape backslashes
    # for the enclosing Desktop Entry string value. This intentionally turns
    # a literal backslash into four backslashes in the desktop file.
    command_escaped = value.replace("\\", "\\\\")
    for char in ('"', "$", "`"):
        command_escaped = command_escaped.replace(char, "\\" + char)
    desktop_escaped = command_escaped.replace("\\", "\\\\")
    desktop_escaped = desktop_escaped.replace("%", "%%")
    return f'"{desktop_escaped}"'


def render_exec(interpreter: str, script: str) -> str:
    if "=" in interpreter:
        raise ValueError("interpreter path cannot contain '=' in a desktop Exec entry")
    return " ".join(
        (exec_argument(interpreter), exec_argument(script), "--gui")
    )


def data_home() -> Path:
    configured = os.environ.get("XDG_DATA_HOME")
    if configured:
        base = Path(configured)
        if not base.is_absolute():
            raise ValueError("XDG_DATA_HOME must be an absolute path")
    else:
        base = Path.home() / ".local" / "share"
    return Path(os.path.abspath(base))


def atomic_write(path: Path, contents: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(contents)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def ensure_applications_link(entry: Path, generated: Path) -> None:
    entry.parent.mkdir(parents=True, exist_ok=True)
    try:
        info = entry.lstat()
    except FileNotFoundError:
        info = None

    if info is not None:
        if not entry.is_symlink() or os.path.abspath(os.path.join(
            entry.parent, os.readlink(entry)
        )) != str(generated):
            raise FileExistsError(
                f"refusing to replace conflicting applications entry: {entry}"
            )
        return

    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{entry.name}.", dir=entry.parent
    )
    os.close(fd)
    os.unlink(temporary_name)
    try:
        os.symlink(str(generated), temporary_name)
        os.replace(temporary_name, entry)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


def migrate_legacy_link(applications: Path, checkout: Path) -> None:
    legacy = applications / LEGACY_NAME
    try:
        if not legacy.is_symlink():
            if os.path.lexists(legacy):
                print(f"Leaving existing legacy entry untouched: {legacy}")
            return
        target = os.readlink(legacy)
        resolved = os.path.abspath(os.path.join(applications, target))
        if resolved == str(checkout / LEGACY_NAME):
            legacy.unlink()
            print(f"Removed obsolete legacy symlink: {legacy}")
        else:
            print(f"Leaving unrelated legacy symlink untouched: {legacy}")
    except OSError as error:
        print(f"Could not inspect legacy entry {legacy}: {error}", file=sys.stderr)


def install() -> None:
    checkout = Path(__file__).resolve().parent.parent
    script = checkout / "scripts" / "qr-relay.py"
    template_path = checkout / TEMPLATE_NAME
    template = template_path.read_text(encoding="utf-8")
    marker = "@EXEC@"
    if template.count(marker) != 1:
        raise ValueError(f"template must contain exactly one {marker} marker")

    rendered = template.replace(
        marker, render_exec(sys.executable, str(script))
    )
    base = data_home()
    generated = base / APP_ID / ENTRY_NAME
    applications = base / "applications"
    entry = applications / ENTRY_NAME

    # Refuse conflicting launcher files before changing the generated artifact.
    try:
        info = entry.lstat()
    except FileNotFoundError:
        info = None
    if info is not None and (
        not entry.is_symlink()
        or os.path.abspath(os.path.join(entry.parent, os.readlink(entry)))
        != str(generated)
    ):
        raise FileExistsError(
            f"refusing to replace conflicting applications entry: {entry}"
        )

    atomic_write(generated, rendered)
    ensure_applications_link(entry, generated)
    migrate_legacy_link(applications, checkout)
    print(f"Installed desktop entry: {entry}")
    print(f"Generated checkout-specific launcher: {generated}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install QR Relay's desktop launcher for this checkout."
    )
    parser.parse_args()
    try:
        install()
    except (OSError, ValueError) as error:
        print(f"install-desktop.py: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
