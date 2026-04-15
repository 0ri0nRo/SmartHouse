"""
honeypot_routes.py
------------------
Flask Blueprint that exposes Cowrie honeypot data via REST API.

Setup
-----
1. Register in app.py:
       from routes.honeypot_routes import honeypot_bp
       app.register_blueprint(honeypot_bp)

2. Mount the cowrie log volume in docker-compose.yml:
       volumes:
         - /home/cowrie/cowrie/var/log/cowrie:/var/log/cowrie:ro

3. (Optional) Override log path via env var:
       COWRIE_LOG_PATH=/custom/path/cowrie.json

Cowrie must be configured to write JSON logs.
Enable in cowrie.cfg:
       [output_jsonlog]
       enabled = true
       logfile = ${honeypot:state_path}/log/cowrie.json

  GET /api/honeypot/events            - latest 200 events feed
  GET /api/honeypot/stats             - aggregated stats + fixed 24h timeline
  GET /api/honeypot/attackers         - per-IP aggregated stats (top 50)
  GET /api/honeypot/credentials       - top credential pairs + distribution
  GET /api/honeypot/commands/top      - top commands run by attackers
  GET /api/honeypot/sessions/<id>     - full detail for a specific session
  GET /api/honeypot/timeline/daily    - per-day event count (last 30 days)
  GET /api/honeypot/files             - uploaded/downloaded files list
  GET /api/honeypot/summary           - lightweight summary for header badges
"""

import os
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request

honeypot_bp = Blueprint("honeypot", __name__)

# Path to cowrie JSON log — override with COWRIE_LOG_PATH env var
COWRIE_LOG_PATH = os.getenv("COWRIE_LOG_PATH", "/var/log/cowrie/cowrie.json")

# Maximum lines to read from the log (keep memory bounded)
MAX_LOG_LINES = 50_000

# Event IDs considered "relevant" for the feed
FEED_EVENTS = {
    "cowrie.session.connect",
    "cowrie.session.closed",
    "cowrie.login.failed",
    "cowrie.login.success",
    "cowrie.command.input",
    "cowrie.direct-tcpip.request",
    "cowrie.session.file_download",
    "cowrie.session.file_upload",
}


# ── helpers ───────────────────────────────────────────────

def _parse_logs() -> list[dict]:
    """Read and parse the cowrie JSON log. Returns a list of event dicts."""
    events: list[dict] = []
    if not os.path.exists(COWRIE_LOG_PATH):
        return events
    try:
        with open(COWRIE_LOG_PATH, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()[-MAX_LOG_LINES:]
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    except (IOError, PermissionError) as exc:
        print(f"[honeypot] Cannot read log: {exc}")
    return events


def _parse_ts(ts_str: str) -> datetime | None:
    """
    Parse an ISO-8601 timestamp string into a UTC-aware datetime.
    Handles:
      - 2024-01-15T14:30:00.123456Z
      - 2024-01-15T14:30:00+00:00
      - 2024-01-15T14:30:00          (assumed UTC)
    """
    if not ts_str:
        return None
    try:
        # Normalize 'Z' suffix
        normalized = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        # If no tzinfo, assume UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except ValueError:
        return None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── routes ────────────────────────────────────────────────

@honeypot_bp.route("/api/honeypot/events")
def get_events():
    """
    GET /api/honeypot/events
    Returns the 200 most recent honeypot events (most recent first),
    filtered to meaningful event types.

    Query params:
      limit  (int, default 200, max 500)
      type   (str) — filter by eventid substring, e.g. "login"
    """
    limit = min(int(request.args.get("limit", 200)), 500)
    type_filter = request.args.get("type", "").lower()

    events = _parse_logs()
    result = []
    for e in reversed(events):
        eid = e.get("eventid", "")
        if eid not in FEED_EVENTS:
            continue
        if type_filter and type_filter not in eid:
            continue
        result.append({
            "eventid":  eid,
            "src_ip":   e.get("src_ip", ""),
            "src_port": e.get("src_port"),
            "username": e.get("username", ""),
            "password": e.get("password", ""),
            "timestamp": e.get("timestamp", ""),
            "session":  e.get("session", ""),
            "input":    e.get("input", ""),
            "protocol": e.get("protocol", "ssh"),
            "duration": e.get("duration"),
            "outfile":  e.get("outfile", ""),
            "url":      e.get("url", ""),
        })
        if len(result) >= limit:
            break
    return jsonify(result)


@honeypot_bp.route("/api/honeypot/stats")
def get_stats():
    """
    GET /api/honeypot/stats
    Returns aggregated statistics.

    FIX: hourly_timeline now uses UTC hours with proper timezone handling,
    and returns ISO timestamps so the frontend can format them in local time.
    """
    events = _parse_logs()

    ip_counter      = Counter()
    user_counter    = Counter()
    pass_counter    = Counter()
    event_counter   = Counter()
    sessions: set[str] = set()
    commands: list[dict] = []
    login_attempts  = 0
    login_success   = 0
    now             = _now_utc()
    cutoff_24h      = now - timedelta(hours=24)

    # hourly[utc_hour_int] = count  — keyed 0..23 for the rolling 24h window
    hourly: dict[int, int] = defaultdict(int)

    for e in events:
        eid = e.get("eventid", "")
        ip  = e.get("src_ip", "")
        ts_str = e.get("timestamp", "")

        if ip:
            ip_counter[ip] += 1
        event_counter[eid] += 1

        if eid == "cowrie.login.failed":
            login_attempts += 1
            u = e.get("username", "")
            p = e.get("password", "")
            if u:
                user_counter[u] += 1
            if p:
                pass_counter[p] += 1

        elif eid == "cowrie.login.success":
            login_success += 1

        if e.get("session"):
            sessions.add(e["session"])

        if eid == "cowrie.command.input":
            commands.append({
                "ip":        ip,
                "input":     e.get("input", ""),
                "timestamp": ts_str,
                "session":   e.get("session", ""),
            })

        # Hourly buckets — use actual UTC hour of the event
        if ts_str:
            ts = _parse_ts(ts_str)
            if ts and ts >= cutoff_24h:
                hourly[ts.hour] += 1

    # Build 24-hour timeline ordered from oldest to newest UTC hour.
    # We emit each slot as an ISO datetime string so the client can
    # render it in the user's local timezone.
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    timeline = []
    for offset in range(23, -1, -1):
        slot_dt = current_hour - timedelta(hours=offset)
        timeline.append({
            # ISO string — frontend parses and formats in local time
            "hour":    slot_dt.isoformat(),
            # Short label for chart axis (UTC hour shown as-is;
            # frontend can reformat using the ISO string above)
            "label":   slot_dt.strftime("%H:00"),
            "attacks": hourly.get(slot_dt.hour, 0),
        })

    return jsonify({
        "total_events":    len(events),
        "unique_ips":      len(ip_counter),
        "total_sessions":  len(sessions),
        "login_attempts":  login_attempts,
        "login_success":   login_success,
        "top_ips": [
            {"ip": ip, "count": c}
            for ip, c in ip_counter.most_common(10)
        ],
        "top_usernames": [
            {"username": u, "count": c}
            for u, c in user_counter.most_common(10)
        ],
        "top_passwords": [
            {"password": p, "count": c}
            for p, c in pass_counter.most_common(10)
        ],
        "event_types":     dict(event_counter),
        "recent_commands": commands[-20:],
        "hourly_timeline": timeline,
        # Server UTC timestamp so the frontend knows the reference point
        "server_utc":      now.isoformat(),
    })


@honeypot_bp.route("/api/honeypot/attackers")
def get_attackers():
    """
    GET /api/honeypot/attackers
    Returns up to 50 unique attacker IPs with per-IP aggregated stats.
    """
    events = _parse_logs()

    attackers: dict[str, dict] = defaultdict(lambda: {
        "ip":         "",
        "attempts":   0,
        "success":    0,
        "sessions":   set(),
        "usernames":  set(),
        "passwords":  set(),
        "commands":   [],
        "files":      [],
        "first_seen": None,
        "last_seen":  None,
        "protocol":   "ssh",
        "src_ports":  set(),
    })

    for e in events:
        ip = e.get("src_ip", "")
        if not ip:
            continue

        a  = attackers[ip]
        a["ip"] = ip
        ts = e.get("timestamp", "")

        if ts:
            if not a["first_seen"] or ts < a["first_seen"]:
                a["first_seen"] = ts
            if not a["last_seen"] or ts > a["last_seen"]:
                a["last_seen"] = ts

        eid = e.get("eventid", "")
        if eid == "cowrie.login.failed":
            a["attempts"] += 1
            if e.get("username"):
                a["usernames"].add(e["username"])
            if e.get("password"):
                a["passwords"].add(e["password"])
        elif eid == "cowrie.login.success":
            a["success"] += 1

        if e.get("session"):
            a["sessions"].add(e["session"])

        if eid == "cowrie.command.input":
            a["commands"].append(e.get("input", ""))

        if eid in ("cowrie.session.file_download", "cowrie.session.file_upload"):
            a["files"].append({
                "url":     e.get("url", e.get("outfile", "")),
                "type":    "download" if eid.endswith("download") else "upload",
                "ts":      ts,
            })

        if e.get("protocol"):
            a["protocol"] = e["protocol"]

        if e.get("src_port"):
            a["src_ports"].add(e["src_port"])

    result = []
    for ip, a in sorted(attackers.items(), key=lambda x: x[1]["attempts"], reverse=True):
        result.append({
            "ip":         ip,
            "attempts":   a["attempts"],
            "success":    a["success"],
            "sessions":   len(a["sessions"]),
            "session_ids": list(a["sessions"])[:5],
            "usernames":  list(a["usernames"])[:8],
            "passwords":  list(a["passwords"])[:8],
            "commands":   a["commands"][-5:],
            "files":      a["files"][-5:],
            "first_seen": a["first_seen"],
            "last_seen":  a["last_seen"],
            "protocol":   a["protocol"],
        })

    return jsonify(result[:50])


@honeypot_bp.route("/api/honeypot/credentials")
def get_credentials():
    """
    GET /api/honeypot/credentials
    Returns:
      - top 20 username+password pairs tried together
      - top 20 usernames
      - top 20 passwords
      - credential diversity score (unique pairs / total attempts)
    """
    events = _parse_logs()

    pair_counter = Counter()
    user_counter = Counter()
    pass_counter = Counter()
    total = 0

    for e in events:
        if e.get("eventid") != "cowrie.login.failed":
            continue
        u = e.get("username", "")
        p = e.get("password", "")
        total += 1
        if u:
            user_counter[u] += 1
        if p:
            pass_counter[p] += 1
        if u and p:
            pair_counter[(u, p)] += 1

    unique_pairs = len(pair_counter)
    diversity = round(unique_pairs / total, 4) if total else 0

    return jsonify({
        "total_attempts":  total,
        "unique_pairs":    unique_pairs,
        "diversity_score": diversity,
        "top_pairs": [
            {"username": u, "password": p, "count": c}
            for (u, p), c in pair_counter.most_common(20)
        ],
        "top_usernames": [
            {"username": u, "count": c}
            for u, c in user_counter.most_common(20)
        ],
        "top_passwords": [
            {"password": p, "count": c}
            for p, c in pass_counter.most_common(20)
        ],
    })


@honeypot_bp.route("/api/honeypot/commands/top")
def get_top_commands():
    """
    GET /api/honeypot/commands/top
    Returns:
      - top 30 commands by frequency
      - command categories (recon, download, persistence, lateral-movement, other)
      - total command count
      - unique command count
    """
    events = _parse_logs()

    cmd_counter = Counter()
    total = 0

    # Simple heuristic categorisation
    RECON_PATTERNS    = re.compile(r"\b(uname|whoami|id|hostname|ifconfig|ip a|cat /etc|ls|pwd|ps|netstat|ss |nmap|ping)\b")
    DOWNLOAD_PATTERNS = re.compile(r"\b(wget|curl|fetch|tftp|ftp|scp|nc |ncat)\b")
    PERSIST_PATTERNS  = re.compile(r"\b(crontab|systemctl|service|rc\.local|\.bashrc|\.profile|authorized_keys|adduser|useradd|passwd)\b")
    LATERAL_PATTERNS  = re.compile(r"\b(ssh |scp |rsync|telnet)\b")

    categories: dict[str, int] = defaultdict(int)

    for e in events:
        if e.get("eventid") != "cowrie.command.input":
            continue
        cmd = (e.get("input") or "").strip()
        if not cmd:
            continue
        cmd_counter[cmd] += 1
        total += 1

        if DOWNLOAD_PATTERNS.search(cmd):
            categories["download"] += 1
        elif RECON_PATTERNS.search(cmd):
            categories["recon"] += 1
        elif PERSIST_PATTERNS.search(cmd):
            categories["persistence"] += 1
        elif LATERAL_PATTERNS.search(cmd):
            categories["lateral-movement"] += 1
        else:
            categories["other"] += 1

    return jsonify({
        "total_commands":  total,
        "unique_commands": len(cmd_counter),
        "categories":      dict(categories),
        "top_commands": [
            {"command": cmd, "count": c}
            for cmd, c in cmd_counter.most_common(30)
        ],
    })


@honeypot_bp.route("/api/honeypot/sessions/<session_id>")
def get_session(session_id: str):
    """
    GET /api/honeypot/sessions/<session_id>
    Returns the full chronological event log for a specific Cowrie session.
    """
    events = _parse_logs()

    session_events = [
        e for e in events
        if e.get("session") == session_id
    ]

    if not session_events:
        return jsonify({"error": "session not found"}), 404

    # Sort chronologically
    session_events.sort(key=lambda e: e.get("timestamp", ""))

    ip          = session_events[0].get("src_ip", "")
    first_ts    = session_events[0].get("timestamp", "")
    last_ts     = session_events[-1].get("timestamp", "")
    commands    = [e.get("input", "") for e in session_events if e.get("eventid") == "cowrie.command.input"]
    login_ok    = any(e.get("eventid") == "cowrie.login.success" for e in session_events)
    credentials = [
        {"username": e.get("username", ""), "password": e.get("password", "")}
        for e in session_events
        if e.get("eventid") in ("cowrie.login.failed", "cowrie.login.success")
    ]
    files = [
        {"url": e.get("url", e.get("outfile", "")),
         "type": "download" if e.get("eventid", "").endswith("download") else "upload",
         "ts": e.get("timestamp")}
        for e in session_events
        if e.get("eventid") in ("cowrie.session.file_download", "cowrie.session.file_upload")
    ]

    # Try to compute duration
    duration = None
    t0, t1 = _parse_ts(first_ts), _parse_ts(last_ts)
    if t0 and t1:
        duration = round((t1 - t0).total_seconds(), 2)

    return jsonify({
        "session_id":  session_id,
        "src_ip":      ip,
        "first_seen":  first_ts,
        "last_seen":   last_ts,
        "duration_s":  duration,
        "login_success": login_ok,
        "credentials": credentials,
        "commands":    commands,
        "files":       files,
        "event_count": len(session_events),
        "events":      [
            {
                "eventid":   e.get("eventid"),
                "timestamp": e.get("timestamp"),
                "username":  e.get("username"),
                "password":  e.get("password"),
                "input":     e.get("input"),
                "outfile":   e.get("outfile"),
                "url":       e.get("url"),
            }
            for e in session_events
        ],
    })


@honeypot_bp.route("/api/honeypot/timeline/daily")
def get_daily_timeline():
    """
    GET /api/honeypot/timeline/daily
    Returns per-day event counts for the last 30 days (UTC).
    Useful for a calendar heatmap or bar chart.

    Query params:
      days  (int, default 30, max 90)
    """
    days = min(int(request.args.get("days", 30)), 90)
    events = _parse_logs()

    now    = _now_utc()
    cutoff = now - timedelta(days=days)

    daily: dict[str, int] = defaultdict(int)
    daily_logins: dict[str, int] = defaultdict(int)

    for e in events:
        ts_str = e.get("timestamp", "")
        if not ts_str:
            continue
        ts = _parse_ts(ts_str)
        if not ts or ts < cutoff:
            continue
        day_key = ts.strftime("%Y-%m-%d")
        daily[day_key] += 1
        if e.get("eventid") == "cowrie.login.failed":
            daily_logins[day_key] += 1

    # Build full timeline filling missing days with 0
    timeline = []
    for offset in range(days - 1, -1, -1):
        day_dt  = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_key = day_dt.strftime("%Y-%m-%d")
        timeline.append({
            "date":         day_key,
            "attacks":      daily.get(day_key, 0),
            "login_failed": daily_logins.get(day_key, 0),
        })

    return jsonify({
        "days":     days,
        "timeline": timeline,
        "peak_day": max(timeline, key=lambda d: d["attacks"], default=None),
        "total":    sum(d["attacks"] for d in timeline),
    })


@honeypot_bp.route("/api/honeypot/files")
def get_files():
    """
    GET /api/honeypot/files
    Returns all file download/upload events observed by the honeypot,
    sorted by most recent first.
    """
    events = _parse_logs()

    FILE_EVENTS = {"cowrie.session.file_download", "cowrie.session.file_upload"}
    files = []

    for e in reversed(events):
        if e.get("eventid") not in FILE_EVENTS:
            continue
        files.append({
            "type":      "download" if e.get("eventid", "").endswith("download") else "upload",
            "src_ip":    e.get("src_ip", ""),
            "session":   e.get("session", ""),
            "url":       e.get("url", ""),
            "outfile":   e.get("outfile", ""),
            "shasum":    e.get("shasum", ""),
            "timestamp": e.get("timestamp", ""),
        })
        if len(files) >= 100:
            break

    return jsonify(files)


@honeypot_bp.route("/api/honeypot/summary")
def get_summary():
    """
    GET /api/honeypot/summary
    Lightweight endpoint for header badges — reads only what it needs.
    Returns counts for the last 1h, 24h, and all-time.
    """
    events = _parse_logs()
    now     = _now_utc()
    cut_1h  = now - timedelta(hours=1)
    cut_24h = now - timedelta(hours=24)

    counts = {"1h": 0, "24h": 0, "total": len(events)}
    logins = {"1h": 0, "24h": 0}
    unique_ips_24h: set[str] = set()

    for e in events:
        ts = _parse_ts(e.get("timestamp", ""))
        ip  = e.get("src_ip", "")
        eid = e.get("eventid", "")
        if ts:
            if ts >= cut_24h:
                counts["24h"] += 1
                if ip:
                    unique_ips_24h.add(ip)
                if eid == "cowrie.login.success":
                    logins["24h"] += 1
            if ts >= cut_1h:
                counts["1h"] += 1
                if eid == "cowrie.login.success":
                    logins["1h"] += 1

    return jsonify({
        "events_1h":        counts["1h"],
        "events_24h":       counts["24h"],
        "events_total":     counts["total"],
        "login_success_1h": logins["1h"],
        "login_success_24h": logins["24h"],
        "unique_ips_24h":   len(unique_ips_24h),
        "server_utc":       now.isoformat(),
    })