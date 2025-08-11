from flask import Blueprint, jsonify, request
from models.database import handle_db_error
from services.network_service import NetworkService
from config.settings import get_config

# Blueprint for network-related API endpoints
network_bp = Blueprint('network', __name__)
config = get_config()

# Service to interact with network data and operations
network_service = NetworkService(config['DB_CONFIG'])


@network_bp.route('/api/devices', methods=['GET'])
@handle_db_error
def api_get_devices():
    """
    API endpoint to retrieve the latest list of network devices.

    Returns:
        JSON list of devices with their latest status.
    """
    devices_list = network_service.get_latest_devices()
    return jsonify(devices_list)


@network_bp.route('/api/devices/stats', methods=['GET'])
@handle_db_error
def api_device_stats():
    """
    API endpoint to retrieve statistics about network devices.

    Example stats:
        - Number of connected devices
        - Device uptime
        - Connection patterns
    """
    stats = network_service.get_device_stats()
    return jsonify(stats), 200


@network_bp.route('/api/devices/most_connected_days', methods=['GET'])
@handle_db_error
def api_most_connected_days():
    """
    API endpoint to retrieve the days with the highest
    number of connections per device.

    Returns:
        JSON object mapping devices to their most active days.
    """
    data = network_service.get_most_connected_days()
    return jsonify(data), 200


@network_bp.route('/api/devices/scan', methods=['POST'])
@handle_db_error
def api_scan_network():
    """
    API endpoint to trigger a network scan.

    Request JSON body (optional):
        {
            "network": "192.168.1.0/24"
        }

    If 'network' is not provided, defaults to '192.168.178.0/24'.

    Returns:
        - Message confirming scan completion
        - Number of devices found
        - List of detected devices
    """
    data = request.get_json()
    network = data.get('network', '192.168.178.0/24') if data else '192.168.178.0/24'
    
    try:
        devices = network_service.scan_network(network)
        return jsonify({
            'message': 'Scan completed',
            'devices_found': len(devices),
            'devices': devices
        }), 200
    except Exception as e:
        return jsonify({'error': f'Error during scan: {str(e)}'}), 500
