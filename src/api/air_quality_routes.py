from flask import Blueprint, jsonify, render_template, request
from datetime import datetime, timedelta
from models.database import handle_db_error, get_db_connection
from services.air_quality_service import AirQualityService
from client.PostgresClient import PostgresHandler
from config.settings import get_config
import psycopg2.extras
import logging
from utils.redis_cache import cache_json_response, invalidate_cached_paths

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
@cache_json_response(ttl_seconds=30)
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
            invalidate_cached_paths(
                '/api/air_quality',
                '/api/last_air_quality_today',
                '/api/air_quality_today',
                '/api/gas_concentration_today',
                '/api/air_quality_monthly',
                '/api/air_quality_yearly',
            )
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
@cache_json_response(ttl_seconds=60)
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
@cache_json_response(ttl_seconds=300)
def api_air_quality_today_simplified():
    """Returns a simplified view of today's hourly air quality index (average values)."""
    data = air_quality_service.get_daily_aggregated()
    if not data:
        return jsonify({'error': 'No data', 'message': 'No records for today'}), 404
    
    simplified = {str(hour): values['avg_air_quality_index'] for hour, values in data.items()}
    return jsonify(simplified), 200


@air_quality_bp.route('/api/gas_concentration_today', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=300)
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


@air_quality_bp.route('/api/air_quality_monthly/<int:month>/<int:year>', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=1800)
def api_air_quality_monthly(month, year):
    """Returns daily average AQI for a given month/year."""
    conn = get_db_connection(config['DB_CONFIG'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        q = """
            SELECT
                EXTRACT(DAY FROM timestamp)::int AS day,
                ROUND(AVG(air_quality_index)::numeric, 2) AS avg_aqi
            FROM air_quality
            WHERE EXTRACT(MONTH FROM timestamp) = %s
              AND EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY EXTRACT(DAY FROM timestamp)
            ORDER BY day;
        """
        cur.execute(q, (month, year))
        rows = cur.fetchall()
        if not rows:
            return jsonify({'error': 'No data'}), 404
        return jsonify({str(int(r['day'])): float(r['avg_aqi']) for r in rows}), 200
    finally:
        cur.close()
        conn.close()


@air_quality_bp.route('/api/air_quality_yearly/<int:year>', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=3600)
def api_air_quality_yearly(year):
    """Returns monthly average AQI for a given year."""
    conn = get_db_connection(config['DB_CONFIG'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        q = """
            SELECT
                EXTRACT(MONTH FROM timestamp)::int AS month,
                ROUND(AVG(air_quality_index)::numeric, 2) AS avg_aqi
            FROM air_quality
            WHERE EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY EXTRACT(MONTH FROM timestamp)
            ORDER BY month;
        """
        cur.execute(q, (year,))
        rows = cur.fetchall()
        if not rows:
            return jsonify({'error': 'No data'}), 404
        return jsonify({str(int(r['month'])): float(r['avg_aqi']) for r in rows}), 200
    finally:
        cur.close()
        conn.close()


@air_quality_bp.route('/api/air_quality_range', methods=['GET'])
@handle_db_error
def api_air_quality_range():
    """
    Returns air quality data for a custom date range, aggregated by hour.
    
    Query parameters:
        - start: Start date (YYYY-MM-DD), default: 7 days ago
        - end: End date (YYYY-MM-DD), default: today
    
    Response:
    {
        "start_date": "2026-04-28",
        "end_date": "2026-05-05",
        "total_records": 1234,
        "hours": {
            "2026-04-28T00": { "avg_aqi": 85.2, "count": 10, ... },
            ...
        }
    }
    """
    try:
        # Parse date parameters
        end_str = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        start_str = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        
        start_date = datetime.strptime(start_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_str, '%Y-%m-%d') + timedelta(days=1)  # Include full end day
        
        conn = get_db_connection(config['DB_CONFIG'])
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        q = """
            SELECT 
                TO_CHAR(timestamp, 'YYYY-MM-DD"T"HH') as hour_key,
                ROUND(AVG(air_quality_index)::numeric, 2) as avg_aqi,
                ROUND(AVG(smoke)::numeric, 2) as avg_smoke,
                ROUND(AVG(lpg)::numeric, 2) as avg_lpg,
                ROUND(AVG(methane)::numeric, 2) as avg_methane,
                ROUND(AVG(hydrogen)::numeric, 2) as avg_hydrogen,
                MIN(air_quality_index) as min_aqi,
                MAX(air_quality_index) as max_aqi,
                COUNT(*) as record_count
            FROM air_quality
            WHERE timestamp >= %s AND timestamp < %s
            GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD"T"HH')
            ORDER BY hour_key ASC;
        """
        
        cur.execute(q, (start_date, end_date))
        rows = cur.fetchall()
        
        if not rows:
            return jsonify({
                'error': 'No data',
                'message': f'No records found between {start_str} and {end_str}',
                'start_date': start_str,
                'end_date': end_str
            }), 404
        
        hours_data = {}
        for r in rows:
            hours_data[r['hour_key']] = {
                'avg_aqi': float(r['avg_aqi']),
                'avg_smoke': float(r['avg_smoke']),
                'avg_lpg': float(r['avg_lpg']),
                'avg_methane': float(r['avg_methane']),
                'avg_hydrogen': float(r['avg_hydrogen']),
                'min_aqi': float(r['min_aqi']),
                'max_aqi': float(r['max_aqi']),
                'record_count': int(r['record_count'])
            }
        
        cur.close()
        conn.close()
        
        return jsonify({
            'start_date': start_str,
            'end_date': end_str,
            'total_records': sum(h['record_count'] for h in hours_data.values()),
            'hours_count': len(hours_data),
            'hours': hours_data
        }), 200
    
    except ValueError as e:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    except Exception as e:
        logger.error(f"Error in air_quality_range: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@air_quality_bp.route('/api/air_quality_table_today', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=60)
def api_air_quality_table_today():
    """
    Returns all air quality records for today organized by hour.
    Useful for dashboard table visualization.
    
    Response format:
    {
        "date": "2026-05-05",
        "total_records": 150,
        "hours": {
            "0": { "records": [...], "avg_aqi": 85.2, "count": 10 },
            "1": { "records": [...], "avg_aqi": 87.5, "count": 12 },
            ...
        }
    }
    """
    conn = get_db_connection(config['DB_CONFIG'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        q = """
            SELECT 
                id,
                EXTRACT(HOUR FROM timestamp)::int AS hour,
                smoke, lpg, methane, hydrogen,
                air_quality_index, air_quality_description,
                timestamp
            FROM air_quality
            WHERE DATE(timestamp) = CURRENT_DATE
            ORDER BY timestamp ASC;
        """
        cur.execute(q)
        rows = cur.fetchall()
        
        if not rows:
            return jsonify({
                'error': 'No data',
                'message': 'No records for today',
                'date': datetime.now().strftime('%Y-%m-%d')
            }), 404
        
        # Organize by hour
        hours_data = {}
        for r in rows:
            hour = int(r['hour'])
            if hour not in hours_data:
                hours_data[hour] = {
                    'records': [],
                    'aqi_values': [],
                    'count': 0
                }
            
            record = {
                'id': r['id'],
                'smoke': float(r['smoke']),
                'lpg': float(r['lpg']),
                'methane': float(r['methane']),
                'hydrogen': float(r['hydrogen']),
                'air_quality_index': float(r['air_quality_index']),
                'air_quality_description': r['air_quality_description'],
                'timestamp': r['timestamp'].isoformat()
            }
            hours_data[hour]['records'].append(record)
            hours_data[hour]['aqi_values'].append(float(r['air_quality_index']))
            hours_data[hour]['count'] += 1
        
        # Calculate aggregates per hour
        result_hours = {}
        for hour in sorted(hours_data.keys()):
            data = hours_data[hour]
            result_hours[str(hour).zfill(2)] = {
                'count': data['count'],
                'avg_aqi': round(sum(data['aqi_values']) / len(data['aqi_values']), 2),
                'min_aqi': round(min(data['aqi_values']), 2),
                'max_aqi': round(max(data['aqi_values']), 2),
                'records': data['records']
            }
        
        return jsonify({
            'date': datetime.now().strftime('%Y-%m-%d'),
            'total_records': len(rows),
            'hours': result_hours
        }), 200
    finally:
        cur.close()
        conn.close()