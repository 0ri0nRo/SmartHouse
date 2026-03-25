"""
Sun & Moon Routes - /api/sunmoon
"""

from flask import Blueprint, jsonify
from services.sunmoon_service import SunMoonService
import logging
import os

logger = logging.getLogger(__name__)

sunmoon_bp = Blueprint("sunmoon", __name__, url_prefix="/api")

# Coordinates can be overridden via env variables
_lat = float(os.getenv("HOME_LAT", "41.7276"))
_lon = float(os.getenv("HOME_LON", "13.3681"))
_service = SunMoonService(lat=_lat, lon=_lon)


@sunmoon_bp.route("/sunmoon", methods=["GET"])
def get_sunmoon():
    """
    GET /api/sunmoon
    Returns sunrise, sunset, day length, and moon phase for today.

    Response example:
    {
      "sunrise": "06:42",
      "sunset": "19:28",
      "day_length": "12h 46m",
      "moon_phase": 0.412,
      "moon_phase_name": "Waxing Gibbous",
      "moon_emoji": "🌔",
      "next_full_moon": "2026-04-13",
      "next_new_moon": "2026-03-29"
    }
    """
    try:
        data = _service.get_data()
        return jsonify(data)
    except Exception as e:
        logger.error(f"sunmoon error: {e}")
        return jsonify({"error": str(e)}), 500