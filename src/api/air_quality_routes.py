from flask import Blueprint, jsonify, render_template, request
from datetime import datetime, timedelta
from models.database import handle_db_error, get_db_connection
from services.air_quality_service import AirQualityService
from client.PostgresClient import PostgresHandler
from config.settings import get_config
import psycopg2.extras
import logging

# Blueprint for air quality endpoints
air_quality_bp = Blueprint('air_quality', __name__)
config = get_config()
air_quality_service = AirQualityService(config['DB_CONFIG'])
db = PostgresHandler(config['DB_CONFIG'])
logger = logging.getLogger(__name__)

# Variable used for caching the last aggregation timestamp
last_aggregation_time = None


@air_quality_bp.route('/api/air_quality', methods=['GET', 'POST'])
@handle_db_error
def api_air_quality():
    """
    API endpoint for managing air quality data.
    
    GET:
        - Fetches recent air quality data from the database.
        - Supports query parameters:
            - limit (max records, default 1000, capped at 5000)
            - hours (time range in hours, default 24, capped at 168)
    
    POST:
        - Inserts a new air quality record into the database.
        - Expects JSON payload with measurement values.
    """
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
                    'message': f'No records in the last {hours_back} hours.',
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
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        payload = request.get_json()
        try:
            insert_res = air_quality_service.insert_record(payload)
            return jsonify({
                'message': 'Data saved',
                'id': insert_res['id'],
                'timestamp': insert_res['timestamp'],
                'data': payload
            }), 201
        except ValueError as e:
            return jsonify({'error': 'Validation failed', 'message': str(e)}), 400


@air_quality_bp.route('/api/last_air_quality_today', methods=['GET'])
@handle_db_error
def api_last_air_quality_today():
    """Returns the latest air quality reading recorded today."""
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
            return jsonify({'error': 'No data found', 'message': 'No records for today'}), 404
        
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
    """Returns a simplified view of today's hourly air quality index (average values)."""
    data = air_quality_service.get_daily_aggregated()
    if not data:
        return jsonify({'error': 'No data', 'message': 'No records for today'}), 404
    
    simplified = {str(hour): values['avg_air_quality_index'] for hour, values in data.items()}
    return jsonify(simplified), 200


@air_quality_bp.route('/api/gas_concentration_today', methods=['GET'])
@handle_db_error
def api_gas_concentration_today():
    """
    Returns today's hourly gas concentration data.
    
    Uses cached aggregation results for up to 1 hour to improve performance.
    If more than 1 hour has passed since the last aggregation, it triggers a new aggregation process.
    """
    global last_aggregation_time
    
    try:
        current_time = datetime.now()
        if last_aggregation_time is None or (current_time - last_aggregation_time) >= timedelta(hours=1):
            try:
                db.create_temp_table_and_aggregate_air_quality()
                # Update last_aggregation_time only if aggregation succeeds
                last_aggregation_time = current_time
            except Exception as e:
                logger.error(f"Aggregation error: {e}")
        
        data = air_quality_service.get_hourly_gas_concentration()
        if not data:
            return jsonify({'error': 'No data available'}), 404
        
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error in gas_concentration_today: {e}")
        return jsonify({'error': f'Internal error: {str(e)}'}), 500


@air_quality_bp.route('/air_quality')
def page_air_quality():
    """Renders the air quality dashboard HTML page."""
    return render_template('air_quality.html')
