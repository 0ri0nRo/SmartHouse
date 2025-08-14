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

@pico_logs_bp.route('/api/pico-logs', methods=['POST'])
@handle_db_error
def receive_pico_log():
    """API endpoint to receive a single log from Pico W"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        log_data = request.get_json()
        
        if not log_data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Validate required fields
        required_fields = ['level', 'message', 'device_id', 'timestamp']
        for field in required_fields:
            if field not in log_data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Store the log
        log_id = pico_log_service.store_log(
            level=log_data['level'],
            message=log_data['message'],
            device_id=log_data['device_id'],
            timestamp=log_data['timestamp'],
            sensor_data=log_data.get('sensor_data', {})
        )
        
        return jsonify({
            'success': True,
            'message': 'Log received and stored',
            'log_id': log_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error storing Pico log: {str(e)}")
        return jsonify({'error': 'Failed to store log'}), 500

@pico_logs_bp.route('/api/pico-logs/batch', methods=['POST'])
@handle_db_error
def receive_pico_logs_batch():
    """API endpoint to receive multiple logs from Pico W in batch"""
    if not pico_log_service:
        return jsonify({'error': 'Pico logs service not initialized'}), 500
    
    try:
        batch_data = request.get_json()
        
        if not batch_data or 'logs' not in batch_data:
            return jsonify({'error': 'No logs array provided'}), 400
        
        logs = batch_data['logs']
        if not isinstance(logs, list):
            return jsonify({'error': 'Logs must be an array'}), 400
        
        stored_count = 0
        errors = []
        
        for i, log_data in enumerate(logs):
            try:
                # Validate required fields
                required_fields = ['level', 'message', 'device_id', 'timestamp']
                for field in required_fields:
                    if field not in log_data:
                        errors.append(f'Log {i}: Missing field {field}')
                        continue
                
                # Store the log
                pico_log_service.store_log(
                    level=log_data['level'],
                    message=log_data['message'],
                    device_id=log_data['device_id'],
                    timestamp=log_data['timestamp'],
                    sensor_data=log_data.get('sensor_data', {})
                )
                stored_count += 1
                
            except Exception as e:
                errors.append(f'Log {i}: {str(e)}')
        
        return jsonify({
            'success': True,
            'message': f'Batch processed: {stored_count} logs stored',
            'stored_count': stored_count,
            'total_logs': len(logs),
            'errors': errors if errors else None
        }), 201
        
    except Exception as e:
        logger.error(f"Error processing log batch: {str(e)}")
        return jsonify({'error': 'Failed to process log batch'}), 500

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