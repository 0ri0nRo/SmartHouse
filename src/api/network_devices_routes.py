import json
import datetime
import redis
from flask import Blueprint, jsonify, request

network_devices_bp = Blueprint("network_devices", __name__, url_prefix="/api")
r = redis.Redis(host="redis", port=6379, decode_responses=True)


# ── Helper ─────────────────────────────────────────────────

def _get_devices() -> list:
    raw = r.get("network:devices")
    return json.loads(raw) if raw else []


def _find_device(mac: str) -> dict | None:
    return next((d for d in _get_devices() if d.get("mac") == mac), None)


# ── Existing endpoints (extended) ─────────────────────────

@network_devices_bp.route("/devices", methods=["GET"])
def get_devices():
    """All devices, enriched with cached port/OS data."""
    devices = _get_devices()
    return jsonify(devices)


@network_devices_bp.route("/devices/stats", methods=["GET"])
def get_device_stats():
    """Per-device connection counts (used by pie chart)."""
    devices = _get_devices()
    stats = []
    for d in devices:
        mac = d.get("mac", "unknown")
        count = int(r.get(f"network:connection_count:{mac}") or d.get("connection_count", 0))
        stats.append({
            "ip_address": d.get("ip"),
            "hostname": d.get("hostname"),
            "mac": mac,
            "vendor": d.get("vendor"),
            "connection_count": count,
        })
    return jsonify(stats)


@network_devices_bp.route("/devices/most_connected_days", methods=["GET"])
def get_most_connected_days():
    """Weekly activity heatmap: { ip: [sun..sat] }."""
    cached = r.get("network:weekly_activity")
    if cached:
        return jsonify(json.loads(cached))
    return jsonify({})


# ── New: alerts ────────────────────────────────────────────

@network_devices_bp.route("/devices/alerts", methods=["GET"])
def get_alerts():
    """
    New-device alerts seen in the last 24h.
    Returns list ordered by newest first.
    """
    raw_alerts = r.lrange("network:new_devices_alert", 0, 49)
    alerts = []
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=24)

    for raw in raw_alerts:
        try:
            alert = json.loads(raw)
            ts = alert.get("first_seen")
            if ts:
                dt = datetime.datetime.fromisoformat(ts)
                if dt >= cutoff:
                    alerts.append(alert)
        except Exception:
            pass

    return jsonify(alerts)


@network_devices_bp.route("/devices/alerts", methods=["DELETE"])
def clear_alerts():
    """Dismiss all alerts."""
    r.delete("network:new_devices_alert")
    return jsonify({"ok": True})


# ── New: history ───────────────────────────────────────────

@network_devices_bp.route("/devices/history", methods=["GET"])
def get_device_history():
    """Rolling connection history for all devices (last 100 per device)."""
    history = {}
    keys = r.keys("network:history:*")
    for key in keys:
        mac = key.replace("network:history:", "")
        entries = r.lrange(key, 0, 99)
        history[mac] = [json.loads(e) for e in entries]
    return jsonify(history)


@network_devices_bp.route("/devices/<mac>/history", methods=["GET"])
def get_single_device_history(mac: str):
    entries = r.lrange(f"network:history:{mac}", 0, 99)
    return jsonify([json.loads(e) for e in entries])


# ── New: per-device scans ──────────────────────────────────

@network_devices_bp.route("/devices/<mac>/portscan", methods=["POST"])
def port_scan_device(mac: str):
    """Trigger an nmap port scan. Cached for 1 hour."""
    device = _find_device(mac)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    from services.network_service import NetworkService
    ports = NetworkService().scan_ports(device["ip"])
    r.set(f"network:ports:{mac}", json.dumps(ports), ex=3600)

    # patch live cache
    devices = _get_devices()
    patched = [{**d, "open_ports": ports} if d.get("mac") == mac else d for d in devices]
    r.set("network:devices", json.dumps(patched), ex=300)

    return jsonify({"mac": mac, "ip": device["ip"], "ports": ports})


@network_devices_bp.route("/devices/<mac>/osscan", methods=["POST"])
def os_scan_device(mac: str):
    device = _find_device(mac)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    # Controlla se già in cache
    cached = r.get(f"network:os:{mac}")
    if cached:
        os_info = json.loads(cached)
        return jsonify({"mac": mac, "ip": device["ip"], **os_info})

    # Esegui direttamente con subprocess (richiede NET_RAW sul container Flask)
    # oppure delega allo scanner via Redis queue
    r.lpush("network:osscan_queue", json.dumps({"mac": mac, "ip": device["ip"]}))

    return jsonify({"mac": mac, "ip": device["ip"], "os": None, "os_detail": None, "queued": True}), 202
    

# ── Manual scan trigger ────────────────────────────────────

@network_devices_bp.route("/scan", methods=["POST"])
def scan():
    from services.network_service import NetworkService
    devices = NetworkService().scan_network()
    r.set("network:devices", json.dumps(devices), ex=300)
    return jsonify(devices)