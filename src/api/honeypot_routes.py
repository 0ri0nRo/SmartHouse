"""
honeypot_routes.py  (fix — filtra file .bak, supporta cowrie.json.YYYY-MM-DD)
"""

import glob
import json
import os
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request

honeypot_bp = Blueprint("honeypot", __name__)

# ── Config ────────────────────────────────────────────────────────────────────

COWRIE_LOG_PATH  = os.getenv("COWRIE_LOG_PATH",  "/var/log/cowrie/cowrie.json")
FAIL2BAN_DB_PATH = os.getenv("FAIL2BAN_DB_PATH", "/var/lib/fail2ban/fail2ban.sqlite3")
MAX_LOG_LINES    = 50_000

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

# ── Threat classification patterns ───────────────────────────────────────────

THREAT_PATTERNS = {
    "cryptominer": re.compile(
        r"\b(xmrig|minerd|cpuminer|ethminer|t-rex|nbminer|minergate|"
        r"stratum\+tcp|pool\.minexmr|xmr\.pool|monero|nicehash|"
        r"--donate-level|hashrate)\b",
        re.IGNORECASE,
    ),
    "backdoor": re.compile(
        r"\b(nc |ncat|netcat|mkfifo|/dev/tcp|/dev/udp|bash -i|"
        r"python.*socket|perl.*socket|socat|reverse.?shell|"
        r"msfvenom|meterpreter|empire|covenant)\b",
        re.IGNORECASE,
    ),
    "botnet": re.compile(
        r"\b(mirai|qbot|gafgyt|bashlite|tsunami|ddos|flooder|"
        r"wget.*\.sh|curl.*\.sh|chmod \+x|\.\/[a-z0-9]{4,}|"
        r"busybox|tftp.*-g|/tmp/[a-z0-9]{4,})\b",
        re.IGNORECASE,
    ),
    "scanner": re.compile(
        r"\b(nmap|masscan|zmap|zgrab|shodan|censys|nuclei|"
        r"nikto|dirb|gobuster|ffuf|sqlmap|hydra|medusa|"
        r"port.?scan|host.?scan)\b",
        re.IGNORECASE,
    ),
    "ransomware": re.compile(
        r"\b(openssl.*enc|gpg.*encrypt|find.*-exec.*rm|"
        r"shred|wipe|dd if=/dev/zero|rm -rf /|"
        r"\.locked|\.encrypted|ransom)\b",
        re.IGNORECASE,
    ),
    "persistence": re.compile(
        r"\b(crontab|systemctl enable|rc\.local|\.bashrc|\.profile|"
        r"authorized_keys|adduser|useradd|passwd|chpasswd|"
        r"visudo|/etc/cron)\b",
        re.IGNORECASE,
    ),
    "recon": re.compile(
        r"\b(uname|whoami|id |hostname|ifconfig|ip a|ip r|"
        r"cat /etc/passwd|cat /etc/shadow|cat /proc|"
        r"ls -la|pwd|ps aux|netstat|ss -|env|printenv)\b",
        re.IGNORECASE,
    ),
    "lateral_movement": re.compile(
        r"\b(ssh |scp |rsync|telnet|rsh|rlogin|"
        r"proxychains|pivot|tunnel)\b",
        re.IGNORECASE,
    ),
}

HIGH_SEVERITY_PATTERNS = re.compile(
    r"\b(rm -rf /|dd if=/dev/zero|mkfs|fork.?bomb|"
    r":\(\)\{.*\}|chmod 777 /|chown.*root|"
    r"curl.*\|.*sh|wget.*\|.*sh|bash -i|nc.*-e)\b",
    re.IGNORECASE,
)

# Regex per riconoscere un suffisso data valido: .YYYY-MM-DD
_DATE_SUFFIX_RE = re.compile(r"\.\d{4}-\d{2}-\d{2}$")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_log_files() -> list[str]:
    """
    Ritorna la lista di file di log Cowrie da leggere, in ordine cronologico.
    Esclude file con suffissi non-data (.bak, .old, .1, ecc.).
    """
    log_dir  = os.path.dirname(COWRIE_LOG_PATH) or "."
    log_base = os.path.basename(COWRIE_LOG_PATH)

    found: list[str] = []

    # File esatto (cowrie.json) — sempre incluso se esiste
    if os.path.exists(COWRIE_LOG_PATH):
        found.append(COWRIE_LOG_PATH)

    # File con suffisso: solo quelli con formato YYYY-MM-DD
    pattern = os.path.join(log_dir, f"{log_base}.*")
    for f in sorted(glob.glob(pattern)):
        if f in found:
            continue
        # Estrai il suffisso dopo il nome base
        suffix = f[len(os.path.join(log_dir, log_base)):]
        if _DATE_SUFFIX_RE.match(suffix):
            found.append(f)
        # Altrimenti salta (.bak, .old, .1, ecc.)

    return found


def _parse_logs() -> list[dict]:
    log_files = _find_log_files()

    if not log_files:
        log_dir  = os.path.dirname(COWRIE_LOG_PATH) or "."
        try:
            available = os.listdir(log_dir) if os.path.isdir(log_dir) else ["(directory non esiste)"]
        except PermissionError:
            available = ["(permesso negato)"]
        print(f"[honeypot] Nessun log trovato. Cercavo: {COWRIE_LOG_PATH}")
        print(f"[honeypot] Contenuto di {log_dir}: {available}")
        return []

    all_lines: list[str] = []
    for path in log_files:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()
            all_lines.extend(lines)
            print(f"[honeypot] Letto {len(lines)} righe da {path}")
        except (IOError, PermissionError) as exc:
            print(f"[honeypot] Impossibile leggere {path}: {exc}")

    all_lines = all_lines[-MAX_LOG_LINES:]

    events: list[dict] = []
    for line in all_lines:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    return events


def _parse_ts(ts_str: str) -> datetime | None:
    if not ts_str:
        return None
    try:
        normalized = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except ValueError:
        return None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _classify_command(cmd: str) -> list[str]:
    matched = [cat for cat, pattern in THREAT_PATTERNS.items() if pattern.search(cmd)]
    return matched if matched else ["other"]


def _severity(cmd: str) -> str:
    if HIGH_SEVERITY_PATTERNS.search(cmd):
        return "high"
    cats = _classify_command(cmd)
    if any(c in cats for c in ("backdoor", "ransomware", "cryptominer")):
        return "high"
    if any(c in cats for c in ("botnet", "persistence", "lateral_movement")):
        return "medium"
    return "low"


def _build_sessions(events: list[dict]) -> dict[str, dict]:
    sessions: dict[str, dict] = defaultdict(lambda: {
        "session_id":    "",
        "src_ip":        "",
        "first_seen":    None,
        "last_seen":     None,
        "login_success": False,
        "credentials":   [],
        "commands":      [],
        "files":         [],
        "threat_cats":   Counter(),
        "severity":      "low",
    })

    for e in events:
        sid = e.get("session", "")
        if not sid:
            continue

        s   = sessions[sid]
        ts  = e.get("timestamp", "")
        eid = e.get("eventid", "")
        ip  = e.get("src_ip", "")

        s["session_id"] = sid
        if ip:
            s["src_ip"] = ip
        if ts:
            if not s["first_seen"] or ts < s["first_seen"]:
                s["first_seen"] = ts
            if not s["last_seen"] or ts > s["last_seen"]:
                s["last_seen"] = ts

        if eid == "cowrie.login.success":
            s["login_success"] = True
            s["credentials"].append({
                "username": e.get("username", ""),
                "password": e.get("password", ""),
                "success":  True,
            })
        elif eid == "cowrie.login.failed":
            s["credentials"].append({
                "username": e.get("username", ""),
                "password": e.get("password", ""),
                "success":  False,
            })
        elif eid == "cowrie.command.input":
            cmd = e.get("input", "").strip()
            if cmd:
                cats = _classify_command(cmd)
                sev  = _severity(cmd)
                for c in cats:
                    s["threat_cats"][c] += 1
                s["commands"].append({
                    "cmd":        cmd,
                    "timestamp":  ts,
                    "categories": cats,
                    "severity":   sev,
                })
                if sev == "high":
                    s["severity"] = "high"
                elif sev == "medium" and s["severity"] != "high":
                    s["severity"] = "medium"

        elif eid in ("cowrie.session.file_download", "cowrie.session.file_upload"):
            s["files"].append({
                "type":    "download" if eid.endswith("download") else "upload",
                "url":     e.get("url", ""),
                "outfile": e.get("outfile", ""),
                "shasum":  e.get("shasum", ""),
                "ts":      ts,
            })

    return sessions


# ── Route di debug ────────────────────────────────────────────────────────────

@honeypot_bp.route("/api/honeypot/debug")
def get_debug():
    log_dir  = os.path.dirname(COWRIE_LOG_PATH) or "."

    try:
        dir_contents = os.listdir(log_dir) if os.path.isdir(log_dir) else []
    except PermissionError as e:
        dir_contents = [f"ERRORE: {e}"]

    log_files = _find_log_files()
    file_info = []
    for f in log_files:
        try:
            size  = os.path.getsize(f)
            lines = sum(1 for _ in open(f, encoding="utf-8", errors="replace"))
            file_info.append({"path": f, "size_bytes": size, "lines": lines})
        except Exception as e:
            file_info.append({"path": f, "error": str(e)})

    events = _parse_logs()

    # Mostra solo eventi con IP reale (non Docker bridge)
    real_events = [e for e in events if not (e.get("src_ip", "").startswith("172.") or e.get("src_ip", "") == "127.0.0.1")]

    return jsonify({
        "cowrie_log_path":       COWRIE_LOG_PATH,
        "log_dir":               log_dir,
        "log_dir_exists":        os.path.isdir(log_dir),
        "dir_contents":          sorted(dir_contents),
        "log_files_found":       log_files,
        "file_details":          file_info,
        "total_events_read":     len(events),
        "real_attacker_events":  len(real_events),
        "sample_event":          real_events[-1] if real_events else (events[-1] if events else None),
        "server_utc":            _now_utc().isoformat(),
    })


# ── Routes ────────────────────────────────────────────────────────────────────

@honeypot_bp.route("/api/honeypot/events")
def get_events():
    limit       = min(int(request.args.get("limit", 200)), 500)
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
            "eventid":   eid,
            "src_ip":    e.get("src_ip", ""),
            "src_port":  e.get("src_port"),
            "username":  e.get("username", ""),
            "password":  e.get("password", ""),
            "timestamp": e.get("timestamp", ""),
            "session":   e.get("session", ""),
            "input":     e.get("input", ""),
            "protocol":  e.get("protocol", "ssh"),
            "duration":  e.get("duration"),
            "outfile":   e.get("outfile", ""),
            "url":       e.get("url", ""),
        })
        if len(result) >= limit:
            break
    return jsonify(result)


@honeypot_bp.route("/api/honeypot/stats")
def get_stats():
    events       = _parse_logs()
    ip_counter   = Counter()
    user_counter = Counter()
    pass_counter = Counter()
    event_counter= Counter()
    sessions: set[str] = set()
    commands: list[dict] = []
    login_attempts = 0
    login_success  = 0
    now            = _now_utc()
    cutoff_24h     = now - timedelta(hours=24)
    hourly: dict[int, int] = defaultdict(int)

    for e in events:
        eid    = e.get("eventid", "")
        ip     = e.get("src_ip", "")
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

        if ts_str:
            ts = _parse_ts(ts_str)
            if ts and ts >= cutoff_24h:
                hourly[ts.hour] += 1

    current_hour = now.replace(minute=0, second=0, microsecond=0)
    timeline = []
    for offset in range(23, -1, -1):
        slot_dt = current_hour - timedelta(hours=offset)
        timeline.append({
            "hour":    slot_dt.isoformat(),
            "label":   slot_dt.strftime("%H:00"),
            "attacks": hourly.get(slot_dt.hour, 0),
        })

    return jsonify({
        "total_events":    len(events),
        "unique_ips":      len(ip_counter),
        "total_sessions":  len(sessions),
        "login_attempts":  login_attempts,
        "login_success":   login_success,
        "top_ips":         [{"ip": ip, "count": c} for ip, c in ip_counter.most_common(10)],
        "top_usernames":   [{"username": u, "count": c} for u, c in user_counter.most_common(10)],
        "top_passwords":   [{"password": p, "count": c} for p, c in pass_counter.most_common(10)],
        "event_types":     dict(event_counter),
        "recent_commands": commands[-20:],
        "hourly_timeline": timeline,
        "server_utc":      now.isoformat(),
    })


@honeypot_bp.route("/api/honeypot/attackers")
def get_attackers():
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
                "url":  e.get("url", e.get("outfile", "")),
                "type": "download" if eid.endswith("download") else "upload",
                "ts":   ts,
            })

        if e.get("protocol"):
            a["protocol"] = e["protocol"]
        if e.get("src_port"):
            a["src_ports"].add(e["src_port"])

    result = []
    for ip, a in sorted(attackers.items(), key=lambda x: x[1]["attempts"], reverse=True):
        result.append({
            "ip":          ip,
            "attempts":    a["attempts"],
            "success":     a["success"],
            "sessions":    len(a["sessions"]),
            "session_ids": list(a["sessions"])[:5],
            "usernames":   list(a["usernames"])[:8],
            "passwords":   list(a["passwords"])[:8],
            "commands":    a["commands"][-5:],
            "files":       a["files"][-5:],
            "first_seen":  a["first_seen"],
            "last_seen":   a["last_seen"],
            "protocol":    a["protocol"],
        })

    return jsonify(result[:50])


@honeypot_bp.route("/api/honeypot/credentials")
def get_credentials():
    events       = _parse_logs()
    pair_counter = Counter()
    user_counter = Counter()
    pass_counter = Counter()
    total        = 0

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
    diversity    = round(unique_pairs / total, 4) if total else 0

    return jsonify({
        "total_attempts":  total,
        "unique_pairs":    unique_pairs,
        "diversity_score": diversity,
        "top_pairs":       [{"username": u, "password": p, "count": c} for (u, p), c in pair_counter.most_common(20)],
        "top_usernames":   [{"username": u, "count": c} for u, c in user_counter.most_common(20)],
        "top_passwords":   [{"password": p, "count": c} for p, c in pass_counter.most_common(20)],
    })


@honeypot_bp.route("/api/honeypot/commands/top")
def get_top_commands():
    events      = _parse_logs()
    cmd_counter = Counter()
    total       = 0

    RECON_P    = re.compile(r"\b(uname|whoami|id|hostname|ifconfig|ip a|cat /etc|ls|pwd|ps|netstat|ss |nmap|ping)\b")
    DOWNLOAD_P = re.compile(r"\b(wget|curl|fetch|tftp|ftp|scp|nc |ncat)\b")
    PERSIST_P  = re.compile(r"\b(crontab|systemctl|service|rc\.local|\.bashrc|\.profile|authorized_keys|adduser|useradd|passwd)\b")
    LATERAL_P  = re.compile(r"\b(ssh |scp |rsync|telnet)\b")

    categories: dict[str, int] = defaultdict(int)

    for e in events:
        if e.get("eventid") != "cowrie.command.input":
            continue
        cmd = (e.get("input") or "").strip()
        if not cmd:
            continue
        cmd_counter[cmd] += 1
        total += 1

        if DOWNLOAD_P.search(cmd):
            categories["download"] += 1
        elif RECON_P.search(cmd):
            categories["recon"] += 1
        elif PERSIST_P.search(cmd):
            categories["persistence"] += 1
        elif LATERAL_P.search(cmd):
            categories["lateral-movement"] += 1
        else:
            categories["other"] += 1

    return jsonify({
        "total_commands":  total,
        "unique_commands": len(cmd_counter),
        "categories":      dict(categories),
        "top_commands":    [{"command": cmd, "count": c} for cmd, c in cmd_counter.most_common(30)],
    })


@honeypot_bp.route("/api/honeypot/sessions/<session_id>")
def get_session(session_id: str):
    events         = _parse_logs()
    session_events = [e for e in events if e.get("session") == session_id]

    if not session_events:
        return jsonify({"error": "session not found"}), 404

    session_events.sort(key=lambda e: e.get("timestamp", ""))

    ip       = session_events[0].get("src_ip", "")
    first_ts = session_events[0].get("timestamp", "")
    last_ts  = session_events[-1].get("timestamp", "")
    commands = [e.get("input", "") for e in session_events if e.get("eventid") == "cowrie.command.input"]
    login_ok = any(e.get("eventid") == "cowrie.login.success" for e in session_events)
    credentials = [
        {"username": e.get("username", ""), "password": e.get("password", "")}
        for e in session_events
        if e.get("eventid") in ("cowrie.login.failed", "cowrie.login.success")
    ]
    files = [
        {
            "url":  e.get("url", e.get("outfile", "")),
            "type": "download" if e.get("eventid", "").endswith("download") else "upload",
            "ts":   e.get("timestamp"),
        }
        for e in session_events
        if e.get("eventid") in ("cowrie.session.file_download", "cowrie.session.file_upload")
    ]

    duration = None
    t0, t1   = _parse_ts(first_ts), _parse_ts(last_ts)
    if t0 and t1:
        duration = round((t1 - t0).total_seconds(), 2)

    return jsonify({
        "session_id":    session_id,
        "src_ip":        ip,
        "first_seen":    first_ts,
        "last_seen":     last_ts,
        "duration_s":    duration,
        "login_success": login_ok,
        "credentials":   credentials,
        "commands":      commands,
        "files":         files,
        "event_count":   len(session_events),
        "events": [
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
    days   = min(int(request.args.get("days", 30)), 90)
    events = _parse_logs()
    now    = _now_utc()
    cutoff = now - timedelta(days=days)

    daily: dict[str, int]        = defaultdict(int)
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
    events      = _parse_logs()
    FILE_EVENTS = {"cowrie.session.file_download", "cowrie.session.file_upload"}
    files       = []

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
    events  = _parse_logs()
    now     = _now_utc()
    cut_1h  = now - timedelta(hours=1)
    cut_24h = now - timedelta(hours=24)

    counts = {"1h": 0, "24h": 0, "total": len(events)}
    logins = {"1h": 0, "24h": 0}
    unique_ips_24h: set[str] = set()

    for e in events:
        ts  = _parse_ts(e.get("timestamp", ""))
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
        "events_1h":         counts["1h"],
        "events_24h":        counts["24h"],
        "events_total":      counts["total"],
        "login_success_1h":  logins["1h"],
        "login_success_24h": logins["24h"],
        "unique_ips_24h":    len(unique_ips_24h),
        "server_utc":        now.isoformat(),
    })


@honeypot_bp.route("/api/honeypot/banned")
def get_banned():
    jail_filter = request.args.get("jail", "").strip()
    active_only = request.args.get("active", "true").lower() != "false"

    if not os.path.exists(FAIL2BAN_DB_PATH):
        return jsonify({
            "error":   f"Fail2ban database non trovato: {FAIL2BAN_DB_PATH}",
            "db_path": FAIL2BAN_DB_PATH,
        }), 503

    try:
        con = sqlite3.connect(f"file:{FAIL2BAN_DB_PATH}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        cur = con.cursor()

        query      = "SELECT jail, ip, timeofban, bantime FROM bips"
        params: list = []
        conditions = []

        if jail_filter:
            conditions.append("jail = ?")
            params.append(jail_filter)
        if active_only:
            now_ts = int(_now_utc().timestamp())
            conditions.append("(timeofban + bantime) > ?")
            params.append(now_ts)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY timeofban DESC"
        rows   = cur.execute(query, params).fetchall()
        con.close()

    except sqlite3.Error as exc:
        return jsonify({"error": f"Database error: {exc}"}), 500

    now_ts      = int(_now_utc().timestamp())
    result      = []
    jail_counts: Counter = Counter()

    for row in rows:
        ban_start  = row["timeofban"]
        ban_dur    = row["bantime"]
        expires_at = ban_start + ban_dur
        remaining  = max(0, expires_at - now_ts)
        jail_counts[row["jail"]] += 1
        result.append({
            "jail":        row["jail"],
            "ip":          row["ip"],
            "banned_at":   datetime.fromtimestamp(ban_start,  tz=timezone.utc).isoformat(),
            "expires_at":  datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
            "bantime_s":   ban_dur,
            "remaining_s": remaining,
            "active":      remaining > 0,
        })

    return jsonify({
        "total":      len(result),
        "by_jail":    dict(jail_counts),
        "banned":     result,
        "server_utc": _now_utc().isoformat(),
    })


@honeypot_bp.route("/api/honeypot/alerts")
def get_alerts():
    hours    = min(int(request.args.get("hours", 24)), 720)
    limit    = min(int(request.args.get("limit", 50)), 500)
    events   = _parse_logs()
    cutoff   = _now_utc() - timedelta(hours=hours)
    sessions = _build_sessions(events)

    alerts = []
    for sid, s in sessions.items():
        ts = _parse_ts(s["first_seen"] or "")
        if ts and ts < cutoff:
            continue

        reasons   = []
        high_cmds = [c for c in s["commands"] if c["severity"] == "high"]

        if s["login_success"]:
            reasons.append("login_success")
        if high_cmds:
            reasons.append("dangerous_command")
        if s["files"]:
            reasons.append("file_transfer")
        if s["threat_cats"].get("persistence", 0) > 0:
            reasons.append("persistence_attempt")
        if s["threat_cats"].get("backdoor", 0) > 0:
            reasons.append("backdoor_attempt")
        if s["threat_cats"].get("cryptominer", 0) > 0:
            reasons.append("cryptominer")

        if not reasons:
            continue

        sev = "high" if any(r in reasons for r in (
            "login_success", "dangerous_command", "backdoor_attempt"
        )) else "medium"

        alerts.append({
            "session_id":              sid,
            "src_ip":                  s["src_ip"],
            "first_seen":              s["first_seen"],
            "last_seen":               s["last_seen"],
            "severity":                sev,
            "reasons":                 reasons,
            "login_success":           s["login_success"],
            "command_count":           len(s["commands"]),
            "file_count":              len(s["files"]),
            "high_severity_commands":  [c["cmd"] for c in high_cmds[:5]],
            "files":                   s["files"][:3],
            "threat_categories":       dict(s["threat_cats"]),
        })

    SEV_ORDER = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (SEV_ORDER[a["severity"]], a["first_seen"] or ""))

    return jsonify({
        "total":      len(alerts),
        "hours":      hours,
        "alerts":     alerts[:limit],
        "server_utc": _now_utc().isoformat(),
    })


@honeypot_bp.route("/api/honeypot/threats")
def get_threats():
    days     = min(int(request.args.get("days", 7)), 90)
    events   = _parse_logs()
    cutoff   = _now_utc() - timedelta(days=days)
    sessions = _build_sessions(events)

    categories: dict[str, list]      = defaultdict(list)
    severity_counts                   = Counter({"high": 0, "medium": 0, "low": 0})
    daily_threats: dict[str, Counter] = defaultdict(Counter)

    for sid, s in sessions.items():
        ts = _parse_ts(s["first_seen"] or "")
        if not ts or ts < cutoff:
            continue

        severity_counts[s["severity"]] += 1
        day_key       = ts.strftime("%Y-%m-%d")
        dominant_cats = s["threat_cats"].most_common(3)

        if not dominant_cats:
            categories["recon"].append({
                "session_id": sid,
                "src_ip":     s["src_ip"],
                "first_seen": s["first_seen"],
                "severity":   s["severity"],
                "commands":   len(s["commands"]),
            })
            daily_threats[day_key]["recon"] += 1
            continue

        for cat, _ in dominant_cats:
            daily_threats[day_key][cat] += 1
            categories[cat].append({
                "session_id":   sid,
                "src_ip":       s["src_ip"],
                "first_seen":   s["first_seen"],
                "severity":     s["severity"],
                "commands":     len(s["commands"]),
                "example_cmds": [
                    c["cmd"] for c in s["commands"]
                    if cat in c["categories"]
                ][:3],
            })

    summary = []
    for cat, sess_list in sorted(categories.items(), key=lambda x: len(x[1]), reverse=True):
        ips = Counter(s["src_ip"] for s in sess_list)
        summary.append({
            "category":   cat,
            "total":      len(sess_list),
            "unique_ips": len(ips),
            "top_ips":    [{"ip": ip, "count": c} for ip, c in ips.most_common(5)],
            "high_count": sum(1 for s in sess_list if s["severity"] == "high"),
            "examples":   sess_list[:5],
        })

    all_days = []
    for offset in range(days - 1, -1, -1):
        day_dt = (_now_utc() - timedelta(days=offset)).strftime("%Y-%m-%d")
        all_days.append({
            "date":       day_dt,
            "categories": dict(daily_threats.get(day_dt, {})),
            "total":      sum(daily_threats.get(day_dt, {}).values()),
        })

    return jsonify({
        "days":            days,
        "severity":        dict(severity_counts),
        "categories":      summary,
        "daily_timeline":  all_days,
        "total_sessions":  sum(len(v) for v in categories.values()),
        "server_utc":      _now_utc().isoformat(),
    })


@honeypot_bp.route("/api/honeypot/attackers/<ip>")
def get_attacker_profile(ip: str):
    events      = _parse_logs()
    sessions    = _build_sessions(events)
    ip_sessions = [s for s in sessions.values() if s["src_ip"] == ip]

    if not ip_sessions:
        return jsonify({"error": f"No activity found for IP {ip}"}), 404

    all_commands:    list[dict] = []
    all_credentials: list[dict] = []
    all_files:       list[dict] = []
    threat_totals:   Counter    = Counter()
    login_successes              = 0

    for s in ip_sessions:
        all_commands.extend(s["commands"])
        all_credentials.extend(s["credentials"])
        all_files.extend(s["files"])
        threat_totals.update(s["threat_cats"])
        if s["login_success"]:
            login_successes += 1

    unique_creds = list({
        (c["username"], c["password"]): c
        for c in all_credentials
    }.values())

    all_commands.sort(key=lambda c: c.get("timestamp") or "")

    high_cmds  = [c for c in all_commands if c["severity"] == "high"]
    med_cmds   = [c for c in all_commands if c["severity"] == "medium"]
    risk_score = min(100, len(high_cmds) * 20 + len(med_cmds) * 5 + login_successes * 15)

    first_seen = min((s["first_seen"] for s in ip_sessions if s["first_seen"]), default=None)
    last_seen  = max((s["last_seen"]  for s in ip_sessions if s["last_seen"]),  default=None)

    return jsonify({
        "ip":               ip,
        "first_seen":       first_seen,
        "last_seen":        last_seen,
        "total_sessions":   len(ip_sessions),
        "login_successes":  login_successes,
        "risk_score":       risk_score,
        "threat_categories": dict(threat_totals),
        "dominant_threat":  threat_totals.most_common(1)[0][0] if threat_totals else "unknown",
        "credentials": {
            "total_attempts": len(all_credentials),
            "unique_pairs":   len(unique_creds),
            "top_pairs":      unique_creds[:10],
        },
        "commands": {
            "total":         len(all_commands),
            "high_severity": [c["cmd"] for c in high_cmds[:10]],
            "all":           all_commands[-50:],
        },
        "files": {
            "total": len(all_files),
            "list":  all_files,
        },
        "sessions": [
            {
                "session_id":    s["session_id"],
                "first_seen":    s["first_seen"],
                "last_seen":     s["last_seen"],
                "login_success": s["login_success"],
                "commands":      len(s["commands"]),
                "files":         len(s["files"]),
                "severity":      s["severity"],
                "threat_cats":   dict(s["threat_cats"]),
            }
            for s in sorted(ip_sessions, key=lambda x: x["first_seen"] or "", reverse=True)
        ],
        "server_utc": _now_utc().isoformat(),
    })


@honeypot_bp.route("/api/honeypot/downloads/analysis")
def get_downloads_analysis():
    limit       = min(int(request.args.get("limit", 100)), 500)
    events      = _parse_logs()
    FILE_EVENTS = {"cowrie.session.file_download", "cowrie.session.file_upload"}

    seen:   dict[str, dict] = {}
    ip_map: dict[str, set]  = defaultdict(set)

    for e in events:
        if e.get("eventid") not in FILE_EVENTS:
            continue

        sha = e.get("shasum", "").strip()
        url = e.get("url",    "").strip()
        ip  = e.get("src_ip", "").strip()
        key = sha if sha else url

        if not key:
            continue

        if key not in seen:
            seen[key] = {
                "sha256":         sha or None,
                "url":            url,
                "outfile":        e.get("outfile", ""),
                "type":           "download" if e.get("eventid", "").endswith("download") else "upload",
                "first_seen":     e.get("timestamp", ""),
                "last_seen":      e.get("timestamp", ""),
                "session":        e.get("session", ""),
                "count":          0,
                "virustotal_url": f"https://www.virustotal.com/gui/file/{sha}" if sha else None,
            }
        else:
            ts = e.get("timestamp", "")
            if ts > seen[key]["last_seen"]:
                seen[key]["last_seen"] = ts

        seen[key]["count"] += 1
        if ip:
            ip_map[key].add(ip)

    result = []
    for key, meta in seen.items():
        meta["unique_ips"] = len(ip_map[key])
        meta["source_ips"] = list(ip_map[key])[:10]
        result.append(meta)

    result.sort(key=lambda x: x["count"], reverse=True)

    return jsonify({
        "total_unique_files": len(result),
        "files":              result[:limit],
        "server_utc":         _now_utc().isoformat(),
    })