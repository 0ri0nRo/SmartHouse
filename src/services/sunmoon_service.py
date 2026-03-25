"""
Sun & Moon Service
- Sunrise / Sunset via api.sunrise-sunset.org (free, no key)
- Moon phase calculated locally (no external dependency)

Requirements: requests (already in your project)
"""

import requests
import math
import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# Default coordinates — Colletorfer (from your dashboard screenshot).
# Override via constructor or env.
DEFAULT_LAT = 41.7276
DEFAULT_LON = 13.3681


class SunMoonService:
    def __init__(self, lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON):
        self.lat = lat
        self.lon = lon
        self._cache: dict = {}   # {date_str: payload}

    def get_data(self) -> dict:
        today = date.today().isoformat()
        if today in self._cache:
            return self._cache[today]

        payload = {
            **self._get_sun_data(date.today()),
            **self._get_moon_data(date.today()),
        }
        self._cache = {today: payload}   # keep only today
        return payload

    # ──────────────────────────────────────────────────────────
    # Sun data
    # ──────────────────────────────────────────────────────────

    def _get_sun_data(self, d: date) -> dict:
        """Call sunrise-sunset.org and parse UTC times to local Rome time (+1/+2)."""
        try:
            res = requests.get(
                "https://api.sunrise-sunset.org/json",
                params={
                    "lat": self.lat,
                    "lng": self.lon,
                    "date": d.isoformat(),
                    "formatted": 0,   # ISO 8601 UTC
                },
                timeout=8,
            )
            res.raise_for_status()
            data = res.json().get("results", {})

            sunrise_utc = data.get("sunrise", "")
            sunset_utc  = data.get("sunset",  "")
            day_length  = data.get("day_length", 0)  # seconds

            return {
                "sunrise":    self._utc_to_local(sunrise_utc),
                "sunset":     self._utc_to_local(sunset_utc),
                "day_length": self._seconds_to_hm(day_length),
            }
        except Exception as e:
            logger.error(f"SunMoonService sun error: {e}")
            return {"sunrise": "—", "sunset": "—", "day_length": "—"}

    @staticmethod
    def _utc_to_local(iso_str: str) -> str:
        """
        Convert an ISO 8601 UTC string to Europe/Rome local time (simple UTC+1/+2).
        We use a simple DST approximation: +2 from last Sunday of March to last Sunday of October.
        For production, replace with pytz or zoneinfo.
        """
        try:
            from datetime import datetime, timezone, timedelta as td
            dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))

            # Simple Rome DST: last Sunday March → last Sunday October = UTC+2, else UTC+1
            year = dt.year
            def last_sunday(month):
                d = date(year, month, 31 if month in (1,3,5,7,8,10,12) else 30)
                while d.weekday() != 6:
                    d -= timedelta(days=1)
                return d
            dst_start = last_sunday(3)
            dst_end   = last_sunday(10)
            local_date = dt.date()
            offset = td(hours=2) if dst_start <= local_date < dst_end else td(hours=1)
            local = dt + offset
            return local.strftime("%H:%M")
        except Exception:
            return iso_str[:5] if len(iso_str) >= 5 else "—"

    @staticmethod
    def _seconds_to_hm(seconds) -> str:
        try:
            s = int(seconds)
            h, m = divmod(s, 3600)
            return f"{h}h {m // 60}m"
        except Exception:
            return "—"

    # ──────────────────────────────────────────────────────────
    # Moon phase (pure math, no API needed)
    # ──────────────────────────────────────────────────────────

    def _get_moon_data(self, d: date) -> dict:
        phase = self._moon_phase(d)
        name, emoji = self._phase_name(phase)

        # Approx next full moon and new moon
        next_full = self._next_phase(d, target=0.5)
        next_new  = self._next_phase(d, target=0.0)

        return {
            "moon_phase":      round(phase, 3),
            "moon_phase_name": name,
            "moon_emoji":      emoji,
            "next_full_moon":  next_full.isoformat(),
            "next_new_moon":   next_new.isoformat(),
        }

    @staticmethod
    def _moon_phase(d: date) -> float:
        """
        Returns moon phase as a float 0.0–1.0.
        0 = new moon, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
        Algorithm: Conway's calculation method.
        """
        year, month, day = d.year, d.month, d.day
        if month < 3:
            year -= 1
            month += 12
        a = math.floor(year / 100)
        b = 2 - a + math.floor(a / 4)
        jd = (math.floor(365.25 * (year + 4716))
              + math.floor(30.6001 * (month + 1))
              + day + b - 1524.5)
        # Days since known new moon (Jan 6 2000)
        days_since_new = jd - 2451549.5
        cycle_length = 29.53058868
        phase = (days_since_new % cycle_length) / cycle_length
        return phase % 1.0

    @staticmethod
    def _phase_name(phase: float) -> tuple[str, str]:
        if phase < 0.03 or phase >= 0.97:
            return "New Moon", "🌑"
        elif phase < 0.22:
            return "Waxing Crescent", "🌒"
        elif phase < 0.28:
            return "First Quarter", "🌓"
        elif phase < 0.47:
            return "Waxing Gibbous", "🌔"
        elif phase < 0.53:
            return "Full Moon", "🌕"
        elif phase < 0.72:
            return "Waning Gibbous", "🌖"
        elif phase < 0.78:
            return "Last Quarter", "🌗"
        else:
            return "Waning Crescent", "🌘"

    def _next_phase(self, from_date: date, target: float, window: int = 35) -> date:
        """
        Walk forward day by day and return the first date whose phase
        is closest to the target (0 = new, 0.5 = full).
        """
        best_date = from_date + timedelta(days=1)
        best_diff = 1.0
        for i in range(1, window + 1):
            d = from_date + timedelta(days=i)
            p = self._moon_phase(d)
            diff = min(abs(p - target), 1 - abs(p - target))
            if diff < best_diff:
                best_diff = diff
                best_date = d
        return best_date