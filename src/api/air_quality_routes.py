from flask import Blueprint, jsonify, render_template, request
from datetime import datetime, timedelta
from models.database import handle_db_error, get_db_connection
from services.air_quality_service import AirQualityService
from client.PostgresClient import PostgresHandler
from config.settings import get_config
import psycopg2.extras
import logging

air_quality_bp = Blueprint('air_quality', __name__)
config = get_config()
air_quality_service = AirQualityService(config['DB_CONFIG'])
db = PostgresHandler(config['DB_CONFIG'])
logger = logging.getLogger(__name__)

# Variable per il caching dell'aggregazione
last_aggregation_time = None

@air_quality_bp.route('/api/air_quality', methods=['GET', 'POST'])
@handle_db_error
def api_air_quality():
    """API per gestire dati qualità dell'aria (GET/POST)"""
    if request.method == 'GET':
        limit = min(int(request.args.get('limit', 1000)), 5000)
        hours_back = min(int(request.args.get('hours', 24)), 168)
        
        conn = get_db_connection(config['DB_CONFIG'])
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            q = """
                SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp,
                       EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
                FROM air_quality
                WHERE timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp DESC
                LIMIT %s;
            """
            cur.execute(q, (hours_back, limit))
            rows = cur.fetchall()
            
            if not rows:
                return jsonify({
                    'error': 'No data found',
                    'message': f'Nessun dato nelle ultime {hours_back} ore.',
                    'count': 0
                }), 404
            
            out = []
            for r in rows:
                d = dict(r)
                d['smoke'] = float(d['smoke'])
                d['lpg'] = float(d['lpg'])
                d['methane'] = float(d['methane'])
                d['hydrogen'] = float(d['hydrogen'])
                d['air_quality_index'] = float(d['air_quality_index'])
                d['timestamp'] = d['timestamp'].isoformat()
                d['data_age_seconds'] = int(d['seconds_ago'])
                out.append(d)
            
            return jsonify({
                'data': out,
                'count': len(out),
                'hours_requested': hours_back,
                'limit_applied': limit
            }), 200
        finally:
            cur.close()
            conn.close()
    
    else:  # POST
        if not request.is_json:
            return jsonify({'error': 'Content-Type deve essere application/json'}), 400
        
        payload = request.get_json()
        try:
            insert_res = air_quality_service.insert_record(payload)
            return jsonify({
                'message': 'Dati salvati',
                'id': insert_res['id'],
                'timestamp': insert_res['timestamp'],
                'data': payload
            }), 201
        except ValueError as e:
            return jsonify({'error': 'Validazione fallita', 'message': str(e)}), 400

@air_quality_bp.route('/api/last_air_quality_today', methods=['GET'])
@handle_db_error
def api_last_air_quality_today():
    """API per ultima lettura qualità aria di oggi"""
    conn = get_db_connection(config['DB_CONFIG'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        q = """
            SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp
            FROM air_quality
            WHERE DATE(timestamp) = CURRENT_DATE
            ORDER BY timestamp DESC LIMIT 1;
        """
        cur.execute(q)
        r = cur.fetchone()
        
        if not r:
            return jsonify({'error': 'No data found', 'message': 'Nessun dato per oggi'}), 404
        
        res = dict(r)
        res['smoke'] = float(res['smoke'])
        res['lpg'] = float(res['lpg'])
        res['methane'] = float(res['methane'])
        res['hydrogen'] = float(res['hydrogen'])
        res['air_quality_index'] = float(res['air_quality_index'])
        res['timestamp'] = res['timestamp'].isoformat()
        
        return jsonify(res), 200
    finally:
        cur.close()
        conn.close()

@air_quality_bp.route('/api/air_quality_today', methods=['GET'])
@handle_db_error
def api_air_quality_today_simplified():
    """API per qualità aria di oggi (versione semplificata)"""
    data = air_quality_service.get_daily_aggregated()
    if not data:
        return jsonify({'error': 'No data', 'message': 'Nessun dato per oggi'}), 404
    
    simplified = {str(hour): values['avg_air_quality_index'] for hour, values in data.items()}
    return jsonify(simplified), 200

@air_quality_bp.route('/api/gas_concentration_today', methods=['GET'])
@handle_db_error
def api_gas_concentration_today():
    """API per concentrazione gas di oggi"""
    global last_aggregation_time
    
    try:
        current_time = datetime.now()
        if last_aggregation_time is None or (current_time - last_aggregation_time) >= timedelta(hours=1):
            try:
                db.create_temp_table_and_aggregate_air_quality()
                # Update last_aggregation_time only if no exception
                last_aggregation_time = current_time
            except Exception as e:
                logger.error(f"Aggregation error: {e}")
        
        data = air_quality_service.get_hourly_gas_concentration()
        if not data:
            return jsonify({'error': 'Nessun dato disponibile'}), 404
        
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error gas_concentration_today: {e}")
        return jsonify({'error': f'Errore interno: {str(e)}'}), 500

@air_quality_bp.route('/air_quality')
def page_air_quality():
    """Pagina per visualizzare qualità dell'aria"""
    return render_template('air_quality.html')