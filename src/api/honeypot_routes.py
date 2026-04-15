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
"""

import os
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from flask import Blueprint, jsonify

honeypot_bp = Blueprint("honeypot", __name__)

# Path to cowrie JSON log — override with COWRIE_LOG_PATH env var
COWRIE_LOG_PATH = os.getenv("COWRIE_LOG_PATH", "/var/log/cowrie/cowrie.json")

# Maximum lines to read from the log (keep memory bounded)
MAX_LOG_LINES = 20_000

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
    """Parse an ISO-8601 timestamp string into a UTC datetime."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── routes ────────────────────────────────────────────────

@honeypot_bp.route("/api/honeypot/events")
def get_events():
    """
    GET /api/honeypot/events
    Returns the 200 most recent honeypot events (most recent first),
    filtered to meaningful event types.
    """
    events = _parse_logs()
    result = []
    for e in reversed(events):
        eid = e.get("eventid", "")
        if eid not in FEED_EVENTS:
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
            "outfile":  e.get("outfile", ""),  # for file downloads
        })
        if len(result) >= 200:
            break
    return jsonify(result)


@honeypot_bp.route("/api/honeypot/stats")
def get_stats():
    """
    GET /api/honeypot/stats
    Returns aggregated statistics:
      - Counters: total events, unique IPs, sessions, login attempts/successes
      - Top 10 attacking IPs
      - Top 10 usernames tried
      - Top 10 passwords tried
      - Hourly attack distribution for the last 24 hours
      - Event-type breakdown
      - Last 20 commands typed by attackers
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
    now             = datetime.now(timezone.utc)
    hourly: dict[str, int] = defaultdict(int)

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

        # Hourly buckets for last 24 h
        if ts_str:
            ts = _parse_ts(ts_str)
            if ts and (now - ts).total_seconds() < 86_400:
                hourly[ts.strftime("%H:00")] += 1

    # Build full 24-hour timeline (fill missing hours with 0)
    timeline = [
        {"hour": f"{h:02d}:00", "attacks": hourly.get(f"{h:02d}:00", 0)}
        for h in range(24)
    ]

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
    })


@honeypot_bp.route("/api/honeypot/attackers")
def get_attackers():
    """
    GET /api/honeypot/attackers
    Returns up to 50 unique attacker IPs with per-IP aggregated stats:
      - Total attempts, sessions, first/last seen
      - Sampled usernames, passwords, and commands
    Sorted by attempt count descending.
    """
    events = _parse_logs()

    # Use defaultdict so every IP starts with a clean record
    attackers: dict[str, dict] = defaultdict(lambda: {
        "ip":         "",
        "attempts":   0,
        "success":    0,
        "sessions":   set(),
        "usernames":  set(),
        "passwords":  set(),
        "commands":   [],
        "first_seen": None,
        "last_seen":  None,
        "protocol":   "ssh",
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

        if e.get("protocol"):
            a["protocol"] = e["protocol"]

    result = []
    for ip, a in sorted(attackers.items(), key=lambda x: x[1]["attempts"], reverse=True):
        result.append({
            "ip":         ip,
            "attempts":   a["attempts"],
            "success":    a["success"],
            "sessions":   len(a["sessions"]),
            "usernames":  list(a["usernames"])[:8],
            "passwords":  list(a["passwords"])[:8],
            "commands":   a["commands"][-5:],
            "first_seen": a["first_seen"],
            "last_seen":  a["last_seen"],
            "protocol":   a["protocol"],
        })

    return jsonify(result[:50])