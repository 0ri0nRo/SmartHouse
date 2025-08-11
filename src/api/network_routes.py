from flask import Blueprint, jsonify, request
from models.database import handle_db_error
from services.network_service import NetworkService
from config.settings import get_config

network_bp = Blueprint('network', __name__)
config = get_config()
network_service = NetworkService(config['DB_CONFIG'])

@network_bp.route('/api/devices', methods=['GET'])
@handle_db_error
def api_get_devices():
    """API per ottenere l'elenco dei dispositivi di rete"""
    devices_list = network_service.get_latest_devices()
    return jsonify(devices_list)

@network_bp.route('/api/devices/stats', methods=['GET'])
@handle_db_error
def api_device_stats():
    """API per statistiche dei dispositivi di rete"""
    stats = network_service.get_device_stats()
    return jsonify(stats), 200

@network_bp.route('/api/devices/most_connected_days', methods=['GET'])
@handle_db_error
def api_most_connected_days():
    """API per i giorni con più connessioni per dispositivo"""
    data = network_service.get_most_connected_days()
    return jsonify(data), 200

@network_bp.route('/api/devices/scan', methods=['POST'])
@handle_db_error
def api_scan_network():
    """API per avviare una scansione della rete"""
    data = request.get_json()
    network = data.get('network', '192.168.178.0/24') if data else '192.168.178.0/24'
    
    try:
        devices = network_service.scan_network(network)
        return jsonify({
            'message': 'Scansione completata',
            'devices_found': len(devices),
            'devices': devices
        }), 200
    except Exception as e:
        return jsonify({'error': f'Errore durante la scansione: {str(e)}'}), 500