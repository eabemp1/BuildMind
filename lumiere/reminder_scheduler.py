import argparse
import json
import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


DEFAULT_POLL_SECONDS = 15
DEFAULT_COOLDOWN_MINUTES = 20
MAX_ALERTS_PER_TICK = 3


def parse_args():
    parser = argparse.ArgumentParser(description="Lumiere reminder scheduler")
    parser.add_argument("--reminder-file", required=True, help="Path to reminders.json")
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=int(os.getenv("LUMIERE_REMINDER_POLL_SEC", str(DEFAULT_POLL_SECONDS))),
    )
    parser.add_argument(
        "--cooldown-minutes",
        type=int,
        default=int(os.getenv("LUMIERE_REMINDER_COOLDOWN_MIN", str(DEFAULT_COOLDOWN_MINUTES))),
    )
    return parser.parse_args()


def _safe_iso_now():
    return datetime.now().isoformat()


def _parse_iso(raw):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw))
    except Exception:
        return None


def _as_utc_aware(dt):
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _read_reminders(path):
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_reminders(path, items):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(items, f, indent=2)
    tmp.replace(path)


def _xml_escape(value):
    text = str(value or "")
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _play_native_sound():
    if os.name != "nt":
        return
    try:
        import winsound

        winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS | winsound.SND_ASYNC)
        return
    except Exception:
        pass
    try:
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "[console]::Beep(880,220); Start-Sleep -Milliseconds 120; [console]::Beep(988,240)",
            ],
            check=False,
            timeout=3,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        pass


def _show_native_notification(title, body):
    if os.name != "nt":
        return
    try:
        from win10toast import ToastNotifier

        toaster = ToastNotifier()
        toaster.show_toast(str(title), str(body), duration=6, threaded=True)
        return
    except Exception:
        pass

    title_xml = _xml_escape(title)
    body_xml = _xml_escape(body)
    ps = (
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; "
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null; "
        "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument; "
        f"$xml.LoadXml(\"<toast><visual><binding template='ToastGeneric'><text>{title_xml}</text><text>{body_xml}</text></binding></visual></toast>\"); "
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml); "
        "$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Lumiere'); "
        "$notifier.Show($toast);"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            check=False,
            timeout=6,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        pass


def _collect_due(items, cooldown_minutes):
    now = _as_utc_aware(datetime.now(timezone.utc))
    due = []
    changed = False
    cooldown = timedelta(minutes=max(1, int(cooldown_minutes)))

    for item in items:
        if item.get("done"):
            continue
        due_at = _as_utc_aware(_parse_iso(item.get("due_at")))
        if not due_at or due_at > now:
            continue
        last_alert = _as_utc_aware(_parse_iso(item.get("last_native_alert_at")))
        if last_alert and (now - last_alert) < cooldown:
            continue
        item["last_native_alert_at"] = now.isoformat()
        due.append(item)
        changed = True
        if len(due) >= MAX_ALERTS_PER_TICK:
            break

    return due, changed


def run_loop(reminder_file, poll_seconds, cooldown_minutes):
    reminder_path = Path(reminder_file)
    reminder_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"[SCHEDULER] Running with file={reminder_path}")

    while True:
        try:
            items = _read_reminders(reminder_path)
            due_items, changed = _collect_due(items, cooldown_minutes)
            if changed:
                _write_reminders(reminder_path, items)
            for item in due_items:
                task = str(item.get("text", "Reminder")).strip() or "Reminder"
                due_at = str(item.get("due_at", "")).strip()
                _play_native_sound()
                _show_native_notification("Lumiere Reminder", f"{task} ({due_at})" if due_at else task)
        except Exception:
            pass
        time.sleep(max(5, int(poll_seconds)))


if __name__ == "__main__":
    args = parse_args()
    run_loop(args.reminder_file, args.poll_seconds, args.cooldown_minutes)
