import time
import json
import os
import datetime
import redis
from services.network_service import NetworkService

r = redis.Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=6379,
    decode_responses=True
)

scanner = NetworkService()

# ── Helpers ────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.datetime.utcnow().isoformat()

def day_index() -> int:
    """Sun=0 … Sat=6  (matches JS Date.getDay)"""
    return (datetime.datetime.utcnow().weekday() + 1) % 7


def update_history(devices: list, previous_macs: set) -> set:
    now = now_iso()
    idx = day_index()
    current_macs = {d["mac"] for d in devices if d.get("mac")}

    for device in devices:
        mac = device.get("mac")
        if not mac or mac == "unknown":
            continue

        # ── First-seen timestamp ───────────────────────────
        if not r.exists(f"network:first_seen:{mac}"):
            r.set(f"network:first_seen:{mac}", now)

        # ── Connection counter ─────────────────────────────
        r.incr(f"network:connection_count:{mac}")

        # ── Weekly activity (7-slot hash, one per day) ─────
        r.hincrby(f"network:weekly:{mac}", str(idx), 1)

        # ── Rolling history (last 100 entries) ────────────
        entry = json.dumps({
            "timestamp": now,
            "ip": device.get("ip"),
            "status": "up",
        })
        r.lpush(f"network:history:{mac}", entry)
        r.ltrim(f"network:history:{mac}", 0, 99)

        # ── New-device alert (ignore first boot when set is empty) ──
        if previous_macs and mac not in previous_macs:
            alert = json.dumps({
                "mac": mac,
                "hostname": device.get("hostname"),
                "ip": device.get("ip"),
                "vendor": device.get("vendor"),
                "first_seen": now,
            })
            r.lpush("network:new_devices_alert", alert)
            r.ltrim("network:new_devices_alert", 0, 49)
            print(f"[scanner] 🆕  New device: {device.get('hostname')} ({device.get('ip')})")

    return current_macs


def build_weekly_activity(devices: list) -> dict:
    """{ ip: [sun, mon, tue, wed, thu, fri, sat] }"""
    result = {}
    for device in devices:
        mac = device.get("mac")
        if not mac or mac == "unknown":
            continue
        weekly = r.hgetall(f"network:weekly:{mac}")
        ip = device.get("ip", mac)
        result[ip] = [int(weekly.get(str(i), 0)) for i in range(7)]
    return result


def enrich_with_cached_data(devices: list) -> list:
    """Attach cached OS and port info to each device."""
    enriched = []
    for d in devices:
        mac = d.get("mac", "")
        os_raw = r.get(f"network:os:{mac}")
        ports_raw = r.get(f"network:ports:{mac}")
        first_seen = r.get(f"network:first_seen:{mac}")
        conn_count = r.get(f"network:connection_count:{mac}")

        enriched.append({
            **d,
            **(json.loads(os_raw) if os_raw else {}),
            "open_ports": json.loads(ports_raw) if ports_raw else d.get("open_ports", []),
            "first_seen": first_seen,
            "connection_count": int(conn_count) if conn_count else 0,
        })
    return enriched


# ── Main loop ──────────────────────────────────────────────

previous_macs: set = set()

while True:
    try:
        devices = scanner.scan_network()
        devices = enrich_with_cached_data(devices)

        r.set("network:devices", json.dumps(devices), ex=300)

        previous_macs = update_history(devices, previous_macs)

        weekly = build_weekly_activity(devices)
        r.set("network:weekly_activity", json.dumps(weekly), ex=3600)

        print(f"[scanner] ✓  {len(devices)} devices  |  {len(previous_macs)} tracked")

    except Exception as e:
        print(f"[scanner] Error: {e}")

    time.sleep(30)