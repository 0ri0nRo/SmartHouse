"""
Ping endpoint — used by PingWidget to measure round-trip latency.
Registered as a blueprint in app.py.
"""
from flask import Blueprint, jsonify

ping_bp = Blueprint('ping', __name__)

@ping_bp.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({'ok': True}), 200