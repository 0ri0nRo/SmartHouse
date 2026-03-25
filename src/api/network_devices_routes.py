import json
import redis
from flask import Blueprint, jsonify

network_devices_bp = Blueprint("network_devices", __name__, url_prefix="/api/network")
r = redis.Redis(host='redis', port=6379, decode_responses=True)

@network_devices_bp.route("/devices", methods=["GET"])
def get_devices():
    cached = r.get('network:devices')
    if cached:
        return jsonify(json.loads(cached))
    return jsonify([])  # scanner non ancora pronto

@network_devices_bp.route("/scan", methods=["POST"])
def scan():
    # forza un nuovo scan immediato
    from services.network_service import NetworkService
    devices = NetworkService().scan_network()
    r.set('network:devices', json.dumps(devices), ex=300)
    return jsonify(devices)