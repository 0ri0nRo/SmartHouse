"""
routes/air_quality.py - Air quality monitoring routes
"""

from flask import Blueprint, jsonify, request, current_app
import logging
from datetime import datetime, timedelta
from utils.decorators import handle_db_error

logger = logging.getLogger(__name__)

air_quality_bp = Blueprint('air_quality', __name__)


@air_quality_bp.route('/air_quality', methods=['GET', 'POST'])
@handle_db_error
def air_quality_func():
    """Handle GET (all data) and POST (insert new data) for air quality"""
    db = current_app.postgres_handler
    
    if request.method == 'GET':
        return _handle_get_air_quality(db)
    elif request.method == 'POST':
        return _handle_post_air_quality(db)


@air_quality_bp.route('/air_quality_data')
@handle_db_error
def air_quality_data():
    """Get most recent air quality data"""
    db = current_app.postgres_handler
    
    query = """
    SELECT 
        smoke, lpg, methane, hydrogen, 
        air_quality_index, air_quality_description, 
        timestamp,
        EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
    FROM air_quality 
    ORDER BY timestamp DESC, id DESC
    LIMIT 1;
    """
    
    result = db.execute_query(query, fetch_one=True)
    
    if result:
        data = dict(result)
        data['smoke'] = float(data['smoke'])
        data['lpg'] = float(data['lpg'])
        data['methane'] = float(data['methane'])
        data['hydrogen'] = float(data['hydrogen'])
        data['air_quality_index'] = float(data['air_quality_index'])
        data['timestamp'] = data['timestamp'].isoformat()
        data['data_age_seconds'] = int(data['seconds_ago'])
        data['is_recent'] = data['seconds_ago'] < 300  # Recent if < 5 minutes
        
        logger.info(f"Air quality data found: AQI={data['air_quality_index']}, Age={data['data_age_seconds']}s")
        return jsonify(data)
    else:
        logger.warning("No air quality data available")
        return jsonify({
            "error": "No data available",
            "message": "No data available in air quality table."
        }), 404


@air_quality_bp.route('/last_air_quality_today')
@handle_db_error
def api_last_air_quality_today():
    """Get last air quality reading for today"""
    db = current_app.postgres_handler
    
    query = """
        SELECT 
            smoke, lpg, methane, hydrogen, 
            air_quality_index, air_quality_description, 
            timestamp
        FROM air_quality
        WHERE DATE(timestamp) = CURRENT_DATE
        ORDER BY timestamp DESC
        LIMIT 1;
    """
    
    result = db.execute_query(query, fetch_one=True)

    if not result:
        return jsonify({
            'error': 'No data found',
            'message': 'No data available for today'
        }), 404

    # Convert for JSON compatibility
    data = dict(result)
    data['smoke'] = float(data['smoke'])
    data['lpg'] = float(data['lpg'])
    data['methane'] = float(data['methane'])
    data['hydrogen'] = float(data['hydrogen'])
    data['air_quality_index'] = float(data['air_quality_index'])
    data['timestamp'] = data['timestamp'].isoformat()

    return jsonify(data)


@air_quality_bp.route('/air_quality_today')
@handle_db_error
def api_air_quality_today():
    """Get today's hourly air quality data"""
    db = current_app.postgres_handler
    
    logger.info("Request for daily AQI data")
    
    data = _get_daily_air_quality(db)
    
    if not data:
        logger.warning("No daily data available")
        return jsonify({
            'error': 'No data available', 
            'message': 'No data available for today'
        }), 404

    # Simplified format for frontend
    simplified_data = {}
    for hour, values in data.items():
        simplified_data[str(hour)] = values['avg_air_quality_index']
    
    logger.info(f"Returning data for {len(simplified_data)} hours")
    return jsonify(simplified_data)


@air_quality_bp.route('/gas_concentration_today')
def api_gas_concentration_today():
    """Get today's hourly gas concentration data"""
    try:
        logger.info("Request for gas concentration data")
        
        # Run aggregation if needed
        db = current_app.postgres_handler
        _run_aggregation_if_needed(db)

        # Get hourly gas concentration data
        data = _get_hourly_gas_concentration(db)
        
        if not data:
            logger.warning("No gas data available")
            return jsonify({'error': 'No data available'}), 404

        logger.info(f"Returning gas data for {len(data)} hours")
        return jsonify(data)
        
    except Exception as e:
        logger.error(f"Error in gas_concentration_today: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500


# Helper functions
def _handle_get_air_quality(db):
    """Handle GET request for air quality data"""
    logger.info("Request for all air quality data")
    
    # Optional query parameters
    limit = min(request.args.get('limit', 1000, type=int), 5000)
    hours_back = min(request.args.get('hours', 24, type=int), 168)  # Max 1 week
    
    query = """
        SELECT 
            smoke, lpg, methane, hydrogen, 
            air_quality_index, air_quality_description, 
            timestamp,
            EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
        FROM air_quality 
        WHERE timestamp >= NOW() - INTERVAL '%s hours'
        ORDER BY timestamp DESC
        LIMIT %s;
    """
    
    results = db.execute_query(query, (hours_back, limit))

    if results:
        # Convert results to JSON compatible format
        air_quality_data = []
        for row in results:
            data = dict(row)
            data['smoke'] = float(data['smoke'])
            data['lpg'] = float(data['lpg'])
            data['methane'] = float(data['methane'])
            data['hydrogen'] = float(data['hydrogen'])
            data['air_quality_index'] = float(data['air_quality_index'])
            data['timestamp'] = data['timestamp'].isoformat()
            data['data_age_seconds'] = int(data['seconds_ago'])
            air_quality_data.append(data)
        
        logger.info(f"Returned {len(air_quality_data)} records")
        return jsonify({
            'data': air_quality_data,
            'count': len(air_quality_data),
            'hours_requested': hours_back,
            'limit_applied': limit
        })
    else:
        logger.warning(f"No data found for last {hours_back} hours")
        return jsonify({
            'error': 'No data found',
            'message': f'No data available for last {hours_back} hours.',
            'count': 0
        }), 404


def _handle_post_air_quality(db):
    """Handle POST request for air quality data"""
    logger.info("Request to insert new air quality data")
    
    # Validate Content-Type
    if not request.is_json:
        return jsonify({'error': 'Content-Type must be application/json'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is empty or malformed'}), 400

    # Required fields validation
    required_fields = ['smoke', 'lpg', 'methane', 'hydrogen', 'air_quality_index', 'air_quality_description']
    missing_fields = [field for field in required_fields if field not in data]
    
    if missing_fields:
        return jsonify({
            'error': 'Missing fields',
            'missing_fields': missing_fields,
            'required_fields': required_fields
        }), 400

    # Data validation
    try:
        smoke = float(data['smoke'])
        lpg = float(data['lpg'])
        methane = float(data['methane'])
        hydrogen = float(data['hydrogen'])
        air_quality_index = float(data['air_quality_index'])
        air_quality_description = str(data['air_quality_description']).strip()
        
        # Value range validation (adjust based on your sensors)
        validations = [
            (0 <= smoke <= 1000, "smoke must be between 0 and 1000"),
            (0 <= lpg <= 1000, "lpg must be between 0 and 1000"),
            (0 <= methane <= 1000, "methane must be between 0 and 1000"),
            (0 <= hydrogen <= 1000, "hydrogen must be between 0 and 1000"),
            (0 <= air_quality_index <= 500, "air_quality_index must be between 0 and 500"),
            (bool(air_quality_description), "air_quality_description cannot be empty")
        ]
        
        for is_valid, error_message in validations:
            if not is_valid:
                raise ValueError(error_message)
                
    except (ValueError, TypeError) as e:
        return jsonify({
            'error': 'Data validation failed',
            'message': str(e)
        }), 400

    # Insert into database
    db.create_table_if_not_exists_air_quality()
    
    timestamp = datetime.now()
    query = """
        INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, timestamp;
    """
    
    result = db.execute_query(query, (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp), fetch_one=True)
    
    logger.info(f"New air quality record inserted with ID: {result['id']}")
    
    return jsonify({
        'message': 'Air quality data saved successfully.',
        'id': result['id'],
        'timestamp': result['timestamp'].isoformat(),
        'data': {
            'smoke': smoke,
            'lpg': lpg,
            'methane': methane,
            'hydrogen': hydrogen,
            'air_quality_index': air_quality_index,
            'air_quality_description': air_quality_description
        }
    }), 201


def _get_daily_air_quality(db):
    """Get average air quality index for each hour of current day"""
    query = """
        SELECT
            EXTRACT(HOUR FROM timestamp) AS hour,
            ROUND(AVG(air_quality_index)::numeric, 2) AS avg_air_quality_index,
            COUNT(*) as measurement_count,
            MIN(air_quality_index) as min_aqi,
            MAX(air_quality_index) as max_aqi
        FROM air_quality
        WHERE DATE(timestamp) = CURRENT_DATE
          AND timestamp >= CURRENT_DATE
          AND timestamp < CURRENT_DATE + INTERVAL '1 day'
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour;
    """
    
    rows = db.execute_query(query)
    
    if not rows:
        logger.warning("No daily air quality data found")
        return {}
    
    hourly_data = {}
    for row in rows:
        hour = int(row['hour'])
        hourly_data[hour] = {
            'avg_air_quality_index': float(row['avg_air_quality_index']),
            'measurement_count': int(row['measurement_count']),
            'min_aqi': float(row['min_aqi']),
            'max_aqi': float(row['max_aqi'])
        }
    
    logger.info(f"Retrieved hourly data for {len(hourly_data)} hours")
    return hourly_data


def _get_hourly_gas_concentration(db):
    """Get average gas concentrations for each hour of current day"""
    query = """
        SELECT 
            EXTRACT(HOUR FROM timestamp) AS hour,
            ROUND(AVG(smoke)::numeric, 2) AS avg_smoke,
            ROUND(AVG(lpg)::numeric, 2) AS avg_lpg,
            ROUND(AVG(methane)::numeric, 2) AS avg_methane,
            ROUND(AVG(hydrogen)::numeric, 2) AS avg_hydrogen,
            COUNT(*) as measurement_count
        FROM air_quality 
        WHERE DATE(timestamp) = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour;
    """
    
    rows = db.execute_query(query)
    
    if not rows:
        logger.warning("No gas concentration data found for today")
        # Return empty data structure for all hours
        return {str(hour): {
            'avg_smoke': 0.0,
            'avg_lpg': 0.0,
            'avg_methane': 0.0,
            'avg_hydrogen': 0.0,
            'measurement_count': 0
        } for hour in range(24)}
    
    # Organize results
    hourly_data = {}
    for row in rows:
        hour = str(int(row['hour']))  # Convert to string for consistency
        hourly_data[hour] = {
            'avg_smoke': float(row['avg_smoke'] or 0),
            'avg_lpg': float(row['avg_lpg'] or 0),
            'avg_methane': float(row['avg_methane'] or 0),
            'avg_hydrogen': float(row['avg_hydrogen'] or 0),
            'measurement_count': int(row['measurement_count'])
        }
    
    logger.info(f"Gas concentration data retrieved for {len(hourly_data)} hours")
    return hourly_data


# Global variable to track last aggregation time
_last_aggregation_time = None

def _run_aggregation_if_needed(db):
    """Run aggregation function if needed (once per hour)"""
    global _last_aggregation_time
    current_time = datetime.now()

    # Check if aggregation should run
    if _last_aggregation_time is None or (current_time - _last_aggregation_time) >= timedelta(hours=1):
        try:
            db.create_temp_table_and_aggregate_air_quality()
            _last_aggregation_time = current_time
            logger.info("Air quality aggregation completed")
        except Exception as e:
            logger.error(f"Error during aggregation: {e}")
            # Continue anyway to retrieve available data