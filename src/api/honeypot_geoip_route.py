"""
honeypot_geoip_route.py
-----------------------
Flask Blueprint that adds IP geolocation to the honeypot routes.
Uses the MaxMind GeoLite2-City local database via the geoip2 library —
no HTTP calls, no rate limits, works fully offline.

Registration (in app.py):
    from api.honeypot_geoip_route import honeypot_geo_bp
    app.register_blueprint(honeypot_geo_bp)

Endpoint:
    GET /api/honeypot/geoip          — geolocate the top attacking IPs

Dependencies:
    geoip2          pip install geoip2
    maxminddb       (installed automatically as a geoip2 dependency)

Database file:
    GeoLite2-City.mmdb  — free download from MaxMind (see README below).
    Default path: /usr/share/GeoIP/GeoLite2-City.mmdb
    Override via env var: GEOIP_DB_PATH

Differences vs the ip-api.com version:
    - No outbound HTTP requests → zero rate-limit risk.
    - No per-batch sleeping → lookups are microsecond-fast.
    - Cache TTL kept at 6 hours as a light guard against repeated
      log parses; could safely be removed entirely.
    - Private / reserved IPs (RFC-1918, loopback, link-local) are
      detected before attempting a lookup and returned as placeholders.
    - geoip2 raises AddressNotFoundError for IPs not in the database
      (e.g. newly allocated space); those are handled gracefully.
"""

import ipaddress
import json
import os
import threading
import time
from collections import Counter

from flask import Blueprint, jsonify, request

try:
    import geoip2.database
    import geoip2.errors
    _GEOIP2_AVAILABLE = True
except ImportError:
    _GEOIP2_AVAILABLE = False

honeypot_geo_bp = Blueprint("honeypot_geo", __name__)

# ── Config ────────────────────────────────────────────────────────
COWRIE_LOG_PATH = os.getenv("COWRIE_LOG_PATH", "/var/log/cowrie/cowrie.json")
GEOIP_DB_PATH   = os.getenv("GEOIP_DB_PATH",  "/usr/share/GeoIP/GeoLite2-City.mmdb")
MAX_LOG_LINES   = 50_000

# ── In-memory geo cache ───────────────────────────────────────────
_geo_cache:  dict[str, dict]  = {}
_cache_ts:   dict[str, float] = {}
_cache_lock  = threading.Lock()
CACHE_TTL    = 21_600  # 6 hours

# ── geoip2 reader (lazy-opened, module-level singleton) ───────────
_reader      = None
_reader_lock = threading.Lock()


def _get_reader():
    """Return the shared geoip2 Reader, opening it on first call."""
    global _reader
    if _reader is not None:
        return _reader
    with _reader_lock:
        if _reader is not None:       # double-checked locking
            return _reader
        if not _GEOIP2_AVAILABLE:
            raise RuntimeError(
                "geoip2 is not installed. Run: pip install geoip2"
            )
        if not os.path.exists(GEOIP_DB_PATH):
            raise FileNotFoundError(
                f"GeoLite2-City database not found at {GEOIP_DB_PATH!r}. "
                "Download it from https://www.maxmind.com/en/geolite2/signup "
                "and set GEOIP_DB_PATH to its location."
            )
        _reader = geoip2.database.Reader(GEOIP_DB_PATH)
        return _reader


# ── Helpers ───────────────────────────────────────────────────────

def _is_private(ip: str) -> bool:
    """Return True for loopback, private, link-local, or reserved IPs."""
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def _build_placeholder(ip: str) -> dict:
    """Return an empty geo record for IPs that cannot be resolved."""
    return {
        "ip":          ip,
        "country":     "Unknown",
        "countryCode": "XX",
        "region":      "",
        "city":        "",
        "lat":         0.0,
        "lon":         0.0,
        "isp":         "",
        "org":         "",
        "as":          "",
    }


# ── Log parsing ───────────────────────────────────────────────────
import glob

def _find_log_files_geo() -> list[str]:
    log_dir  = os.path.dirname(COWRIE_LOG_PATH) or "."
    log_base = os.path.basename(COWRIE_LOG_PATH)
    found = []
    if os.path.exists(COWRIE_LOG_PATH):
        found.append(COWRIE_LOG_PATH)
    for f in sorted(glob.glob(os.path.join(log_dir, f"{log_base}.*"))):
        if f not in found:
            found.append(f)
    return found


def _parse_logs_for_geo() -> Counter:
    ip_counter: Counter = Counter()
    for path in _find_log_files_geo():
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh.readlines()[-MAX_LOG_LINES:]:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ip = json.loads(line).get("src_ip", "")
                        if ip:
                            ip_counter[ip] += 1
                    except json.JSONDecodeError:
                        continue
        except (IOError, PermissionError):
            pass
    return ip_counter

# ── Geolocation ───────────────────────────────────────────────────

def _geolocate_ip(ip: str) -> dict:
    """
    Look up a single IP in the local MaxMind database.
    Returns a geo dict; falls back to a placeholder on any error.
    """
    if _is_private(ip):
        return _build_placeholder(ip)

    try:
        reader   = _get_reader()
        response = reader.city(ip)
        return {
            "ip":          ip,
            "country":     response.country.name        or "",
            "countryCode": response.country.iso_code    or "XX",
            "region":      response.subdivisions.most_specific.name or "",
            "city":        response.city.name           or "",
            "lat":         float(response.location.latitude  or 0.0),
            "lon":         float(response.location.longitude or 0.0),
            # GeoLite2-City does not include ISP/org data;
            # those fields come from GeoLite2-ASN (separate DB).
            # We keep the keys so the frontend contract is unchanged.
            "isp":         "",
            "org":         "",
            "as":          "",
        }
    except Exception as exc:
        # AddressNotFoundError, ValueError for malformed IPs, etc.
        print(f"[honeypot_geoip] Lookup failed for {ip}: {exc}")
        return _build_placeholder(ip)


def _geolocate_batch(ips: list[str]) -> dict[str, dict]:
    """
    Geolocate a list of IPs, using the in-memory cache when fresh.
    All lookups are local (no network I/O).
    """
    results: dict[str, dict] = {}
    now     = time.time()

    to_lookup: list[str] = []
    with _cache_lock:
        for ip in ips:
            if ip in _geo_cache and (now - _cache_ts.get(ip, 0)) < CACHE_TTL:
                results[ip] = _geo_cache[ip]
            else:
                to_lookup.append(ip)

    for ip in to_lookup:
        geo = _geolocate_ip(ip)
        with _cache_lock:
            _geo_cache[ip]  = geo
            _cache_ts[ip]   = time.time()
        results[ip] = geo

    return results


# ── Route ─────────────────────────────────────────────────────────

@honeypot_geo_bp.route("/api/honeypot/geoip")
def get_geoip():
    """
    GET /api/honeypot/geoip

    Geolocate the top attacking IPs from the Cowrie log using the local
    MaxMind GeoLite2-City database and return them together with a
    country-level aggregation.

    Query parameters:
        limit   int  (default 50, max 200)
                Number of top IPs to geolocate, ranked by event count.

    Response JSON:
        {
            "attackers": [
                {
                    "ip":          "1.2.3.4",
                    "count":       1234,
                    "country":     "China",
                    "countryCode": "CN",
                    "region":      "Guangdong",
                    "city":        "Shenzhen",
                    "lat":         22.543,
                    "lon":         114.058,
                    "isp":         "",
                    "org":         ""
                },
                ...
            ],
            "countries": [
                {
                    "countryCode": "CN",
                    "country":     "China",
                    "count":       5678,
                    "ips":         12
                },
                ...
            ],
            "total_ips":   50,
            "cached_ips":  50,
            "db_path":     "/usr/share/GeoIP/GeoLite2-City.mmdb"
        }

    Error response (database not found / geoip2 not installed):
        HTTP 503
        { "error": "...", "db_path": "..." }
    """
    # Validate and clamp the limit parameter
    try:
        limit = int(request.args.get("limit", 50))
    except (ValueError, TypeError):
        limit = 50
    limit = max(1, min(limit, 200))

    # Fail fast with a clear error if the database is missing
    try:
        _get_reader()
    except (FileNotFoundError, RuntimeError) as exc:
        return jsonify({"error": str(exc), "db_path": GEOIP_DB_PATH}), 503

    ip_counter = _parse_logs_for_geo()
    if not ip_counter:
        return jsonify({
            "attackers":  [],
            "countries":  [],
            "total_ips":  0,
            "cached_ips": 0,
            "db_path":    GEOIP_DB_PATH,
        })

    # Select the top-N IPs by event count
    top_ips  = [ip for ip, _ in ip_counter.most_common(limit)]
    geo_data = _geolocate_batch(top_ips)

    # Build the attackers list with geo data attached
    attackers = []
    for ip in top_ips:
        geo = geo_data.get(ip, _build_placeholder(ip))
        attackers.append({
            "ip":          ip,
            "count":       ip_counter[ip],
            "country":     geo.get("country",     "Unknown"),
            "countryCode": geo.get("countryCode", "XX"),
            "region":      geo.get("region",      ""),
            "city":        geo.get("city",         ""),
            "lat":         geo.get("lat",          0.0),
            "lon":         geo.get("lon",          0.0),
            "isp":         geo.get("isp",          ""),
            "org":         geo.get("org",          ""),
        })

    # Aggregate by country for the sidebar leaderboard
    from collections import defaultdict
    country_map: dict[str, dict] = defaultdict(lambda: {
        "count": 0, "ips": 0, "country": "", "countryCode": "",
    })
    for a in attackers:
        cc = a["countryCode"] or "XX"
        country_map[cc]["count"]       += a["count"]
        country_map[cc]["ips"]         += 1
        country_map[cc]["country"]      = a["country"]
        country_map[cc]["countryCode"]  = cc

    countries = sorted(
        country_map.values(),
        key=lambda x: x["count"],
        reverse=True,
    )

    return jsonify({
        "attackers":  attackers,
        "countries":  countries,
        "total_ips":  len(top_ips),
        "cached_ips": len(_geo_cache),
        "db_path":    GEOIP_DB_PATH,
    })