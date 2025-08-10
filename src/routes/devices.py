"""
routes/devices.py - Network device monitoring routes
"""

from flask import Blueprint, jsonify, current_app
import logging
from services.network_service import NetworkService

logger = logging.getLogger(__name__)

devices_bp = Blueprint('devices', __name__)


@devices_bp.route('/devices')
def get_devices():
    """Get all devices from the latest network scan"""
    try:
        db = current_app.postgres_handler
        
        query = """
            SELECT * FROM network_devices
            WHERE timestamp = (SELECT MAX(timestamp) FROM network_devices)
            ORDER BY timestamp DESC;
        """
        devices = db.execute_query(query)
        
        # Format device list
        devices_list = []
        for device in devices:
            hostname = device['hostname']
            if hostname.endswith('.fritz.box'):
                hostname = hostname[:-10]  # Remove '.fritz.box'
            if hostname == "":
                hostname = "Fritzbox-modem1234567890"
                
            devices_list.append({
                'id': device['id'],
                'ip_address': device['ip_address'],
                'hostname': hostname,
                'status': device['status'],
                'last_seen': device['timestamp'].isoformat()[:-7]
            })

        return jsonify(devices_list)
        
    except Exception as e:
        logger.error(f"Error in get_devices: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500


@devices_bp.route('/devices/stats')
def get_device_stats():
    """Get device connection statistics"""
    try:
        db = current_app.postgres_handler
        
        query = """
        SELECT
            hostname,
            COUNT(*) AS connection_count
        FROM network_devices
        WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
        GROUP BY hostname
        ORDER BY connection_count DESC;
        """
        
        stats = db.execute_query(query)
        
        # Format results
        result = []
        for stat in stats:
            hostname = stat['hostname'][:-10] if stat['hostname'].endswith('.fritz.box') else stat['hostname']
            if hostname == "":
                hostname = "Fritzbox-modem1234567890"

            if stat['connection_count'] >= 100:
                result.append({
                    'ip_address': hostname,
                    'connection_count': stat['connection_count']
                })
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting device stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@devices_bp.route('/devices/most_connected_days')
def get_most_connected_days():
    """Get the most connected days for top 10 devices"""
    try:
        db = current_app.postgres_handler
        
        # Query to get connection counts by device and day of week
        query = """
        SELECT
            hostname,
            EXTRACT(DOW FROM timestamp) AS day_of_week,
            COUNT(*) AS connection_count
        FROM network_devices
        WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
        GROUP BY hostname, day_of_week
        ORDER BY hostname, day_of_week;
        """
        
        stats = db.execute_query(query)
        
        # Calculate total counts per device
        total_counts = {}
        for stat in stats:
            hostname = stat['hostname'][:-10] if stat['hostname'].endswith('.fritz.box') else stat['hostname']
            if hostname == "":
                hostname = "Fritzbox-Modem"

            total_counts[hostname] = total_counts.get(hostname, 0) + stat['connection_count']

        # Get top 10 devices
        top_devices = sorted(total_counts.items(), key=lambda item: item[1], reverse=True)[:10]

        # Format results for top 10 devices
        result = {}
        for hostname, _ in top_devices:
            result[hostname] = [0] * 7  # Initialize array for days of week

        # Fill day counts for top 10 devices
        for stat in stats:
            hostname = stat['hostname'][:-10] if stat['hostname'].endswith('.fritz.box') else stat['hostname']
            if hostname == "":
                hostname = "Fritzbox-Modem"

            day_of_week = int(stat['day_of_week'])
            connection_count = stat['connection_count']

            if hostname in result:  # Check if device is in top 10
                result[hostname][day_of_week] += connection_count

        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting most connected days: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@devices_bp.route('/scan_network')
def scan_network():
    """Trigger network scan"""
    try:
        db = current_app.postgres_handler
        network_service = NetworkService(db)
        
        devices = network_service.scan_network(current_app.config.get('NETWORK_RANGE', '192.168.178.0/24'))
        
        return jsonify({
            'message': f'Network scan completed. Found {len(devices)} devices',
            'devices': devices
        })
        
    except Exception as e:
        logger.error(f"Error scanning network: {e}")
        return jsonify({'error': 'Failed to scan network'}), 500


@devices_bp.route('/raspberry_pi_stats')
def raspberry_pi_stats():
    """Get Raspberry Pi system statistics"""
    try:
        db = current_app.postgres_handler
        network_service = NetworkService(db)
        
        stats = network_service.get_raspberry_pi_stats()
        
        return jsonify(stats)
        
    except Exception as e:
        logger.error(f"Error getting Raspberry Pi stats: {e}")
        return jsonify({'error': 'Failed to get system statistics'}), 500