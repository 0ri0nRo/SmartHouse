from flask import Blueprint, jsonify, request
from models.database import handle_db_error
import logging

pico_logs_bp = Blueprint('pico_logs', __name__)
logger = logging.getLogger(__name__)

# This will be injected by the main app
pico_log_service = None

def init_pico_logs_service(service):
    """Initialize the pico logs service"""
    global pico_log_service
    pico_log_service = service

@pico_logs_bp.route('/api/pico-logs', methods=['GET'])
@handle_db_error
def get_recent_logs():
    """API endpoint to get recent Pico W logs"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        limit = request.args.get('limit', 50, type=int)
        limit = min(max(limit, 1), 500)  # Ensure limit is between 1 and 500
        
        logs = pico_log_service.get_recent_logs(limit=limit)
        return jsonify({
            'success': True,
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        logger.error(f"Error fetching Pico logs: {str(e)}")
        return jsonify({'error': 'Failed to fetch logs'}), 500

@pico_logs_bp.route('/api/pico-logs/stats', methods=['GET'])
@handle_db_error
def get_log_stats():
    """API endpoint to get Pico W log statistics"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        stats = pico_log_service.get_log_stats()
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Error fetching log stats: {str(e)}")
        return jsonify({'error': 'Failed to fetch log statistics'}), 500

@pico_logs_bp.route('/api/pico-logs/clear', methods=['POST'])
@handle_db_error
def clear_logs():
    """API endpoint to clear all Pico W logs"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        pico_log_service.clear_logs_from_db()
        return jsonify({
            'success': True,
            'message': 'All logs cleared successfully'
        })
    except Exception as e:
        logger.error(f"Error clearing logs: {str(e)}")
        return jsonify({'error': 'Failed to clear logs'}), 500

@pico_logs_bp.route('/api/pico-logs/test', methods=['POST'])
@handle_db_error
def test_log_entry():
    """API endpoint to test log entry (for development)"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        # Create a test log entry
        test_data = {
            'level': 'INFO',
            'message': 'Test log entry from API',
            'sensor_data': {
                'temperature': 22.5,
                'humidity': 65.2,
                'test': True
            },
            'device_id': 'test-device'
        }
        
        # Process the log (this will also broadcast via WebSocket)
        log_entry = pico_log_service.process_pico_log(test_data)
        if log_entry:
            pico_log_service.save_log_to_db(log_entry)
            pico_log_service.socketio.emit('new_log', log_entry, namespace='/pico-logs')
            
            return jsonify({
                'success': True,
                'message': 'Test log entry created',
                'log': log_entry
            })
        else:
            return jsonify({'error': 'Failed to process test log'}), 400
            
    except Exception as e:
        logger.error(f"Error creating test log: {str(e)}")
        return jsonify({'error': 'Failed to create test log'}), 500