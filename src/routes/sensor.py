"""
routes/sensors.py - Temperature and Humidity sensor routes
"""

from flask import Blueprint, jsonify, current_app
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

sensors_bp = Blueprint('sensors', __name__)


@sensors_bp.route('/sensors')
def api_sensors():
    """Return current sensor data in JSON format"""
    try:
        db = current_app.postgres_handler
        data, last_entry = _get_sensor_data(db)

        if not data:
            return jsonify({'error': 'No data available'}), 404

        # Calculate temperature statistics
        temperatures = [entry['avg_temperature'] for entry in data]
        min_temp = f"{min(temperatures):.2f}"
        max_temp = f"{max(temperatures):.2f}"

        # Calculate humidity statistics
        humidities = [entry.get('humidity', 0) for entry in data if entry.get('humidity') is not None]
        if humidities:
            min_hum = f"{min(humidities):.2f}"
            max_hum = f"{max(humidities):.2f}"
            avg_hum = f"{sum(humidities) / len(humidities):.2f}"
        else:
            min_hum = max_hum = avg_hum = "N/A"

        # Format chart data
        chart_data_temperature = [f"{entry['avg_temperature']:.2f}" for entry in data]
        chart_data_humidity = [f"{entry.get('humidity', 0):.2f}" for entry in data if entry.get('humidity') is not None]

        return jsonify({
            'temperature': {
                'current': f"{last_entry.get('temperature_c', 0):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [min_temp, max_temp],
                'chartData': chart_data_temperature
            },
            'humidity': {
                'current': f"{last_entry.get('humidity', 0):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [min_hum, max_hum],
                'average': avg_hum,
                'chartData': chart_data_humidity
            },
            'labels': [f"{int(entry['hour'])}:00" for entry in data]
        })

    except Exception as e:
        logger.error(f"Error in api_sensors: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/last_temp')
def last_temp():
    """Get last temperature reading"""
    try:
        db = current_app.postgres_handler
        result = db.last_temp_db()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error getting last temperature: {e}")
        return jsonify({'error': 'Failed to get temperature data'}), 500


@sensors_bp.route('/monthly_temperature')
def api_monthly_temperature():
    """Return average temperature for each day of each month for current year"""
    try:
        db = current_app.postgres_handler
        data = _get_monthly_temperature_data(db)
        
        if not data:
            return jsonify({'error': 'No data available'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting monthly temperature: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/monthly_average_temperature')
def api_monthly_average_temperature():
    """Return average temperature for each month of current year"""
    try:
        db = current_app.postgres_handler
        data = _get_average_monthly_temperature(db)
        
        if not data:
            return jsonify({'error': 'No data available'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting monthly average temperature: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/daily_temperature/<int:month>/')
def api_daily_temperature(month):
    """Return average temperature for each day of selected month"""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month. Must be between 1 and 12'}), 400
    
    try:
        db = current_app.postgres_handler
        data = _get_daily_temperature_for_month(db, month)
        
        if not data:
            return jsonify({'error': 'No data available for selected month'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting daily temperature for month {month}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/monthly_average_temperature/<int:month>/<int:year>')
def api_monthly_average_temperature_by_month_and_year(month, year):
    """Return average temperature for each day of selected month and year"""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month. Must be between 1 and 12'}), 400

    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year'}), 400

    try:
        db = current_app.postgres_handler
        data = _get_daily_temperature_for_month_and_year(db, month, year)
        
        if not data:
            return jsonify({'error': 'No data available for selected month and year'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting temperature for {month}/{year}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/monthly_average_temperature/<int:year>')
def api_monthly_average_temperature_by_year(year):
    """Return average temperature for each month of selected year"""
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year'}), 400

    try:
        db = current_app.postgres_handler
        data = _get_monthly_average_temperature_by_year(db, year)
        
        if not data:
            return jsonify({'error': 'No data available for selected year'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting monthly temperature for year {year}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/today_temperature')
def today_temperature():
    """Return average temperature for each hour of current day"""
    try:
        db = current_app.postgres_handler
        data = _get_daily_temperature(db)
        
        if not data:
            return jsonify({'error': 'No data available for today'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting today's temperature: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/temperature_average/<start_datetime>/<end_datetime>')
def temperature_average(start_datetime, end_datetime):
    """Return average temperatures between two datetime points"""
    try:
        start_dt = datetime.fromisoformat(start_datetime)
        end_dt = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS)'}), 400

    try:
        db = current_app.postgres_handler
        data = _get_average_temperatures(db, start_dt, end_dt)
        
        if data is None:
            return jsonify({'error': 'Failed to fetch data'}), 500

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting temperature average: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# Humidity endpoints
@sensors_bp.route('/today_humidity')
def today_humidity():
    """Return average humidity for each hour of current day"""
    try:
        db = current_app.postgres_handler
        data = _get_hourly_humidity(db)
        
        if not data:
            return jsonify({'error': 'No data available for today'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting today's humidity: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/daily_humidity/<int:month>/')
def api_daily_humidity(month):
    """Return average humidity for each day of selected month"""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month. Must be between 1 and 12'}), 400
    
    try:
        db = current_app.postgres_handler
        data = _get_daily_humidity_for_month(db, month)
        
        if not data:
            return jsonify({'error': 'No data available for selected month'}), 404

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting daily humidity for month {month}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@sensors_bp.route('/humidity_average/<start_datetime>/<end_datetime>')
def humidity_average(start_datetime, end_datetime):
    """Return average humidity between two datetime points"""
    try:
        start_dt = datetime.fromisoformat(start_datetime)
        end_dt = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS)'}), 400

    try:
        db = current_app.postgres_handler
        data = _get_average_humidity(db, start_dt, end_dt)
        
        if data is None:
            return jsonify({'error': 'Failed to fetch data'}), 500

        return jsonify(data)
    except Exception as e:
        logger.error(f"Error getting humidity average: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# Helper functions
def _get_sensor_data(db):
    """Get hourly sensor data for current day"""
    query = """
        SELECT
            EXTRACT(HOUR FROM timestamp) AS hour,
            AVG(temperature_c) AS avg_temperature,
            AVG(humidity) AS humidity 
        FROM sensor_readings
        WHERE DATE(timestamp) = CURRENT_DATE
        GROUP BY hour
        ORDER BY hour ASC;
    """
    data = db.execute_query(query)

    # Get last entry
    last_query = "SELECT temperature_c, humidity FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
    last_entry = db.execute_query(last_query, fetch_one=True)

    return data, last_entry


def _get_monthly_temperature_data(db):
    """Get average temperature for each day of each month for current year"""
    query = """
        SELECT
            EXTRACT(MONTH FROM timestamp) AS month,
            EXTRACT(DAY FROM timestamp) AS day,
            AVG(temperature_c) AS avg_temperature
        FROM sensor_readings
        WHERE DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
        GROUP BY month, day
        ORDER BY month, day;
    """
    rows = db.execute_query(query)
    
    monthly_data = {}
    for row in rows:
        month = int(row['month'])
        day = int(row['day'])
        avg_temperature = round(float(row['avg_temperature']), 2)
        
        if month not in monthly_data:
            monthly_data[month] = {}
        
        monthly_data[month][day] = avg_temperature

    return monthly_data


def _get_average_monthly_temperature(db, year=None):
    """Get average temperature for each month"""
    if year is None:
        year_condition = "DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)"
        params = ()
    else:
        year_condition = "EXTRACT(YEAR FROM timestamp) = %s"
        params = (year,)

    query = f"""
        SELECT
            EXTRACT(MONTH FROM timestamp) AS month,
            AVG(temperature_c) AS avg_temperature
        FROM sensor_readings
        WHERE {year_condition}
        GROUP BY month
        ORDER BY month;
    """
    rows = db.execute_query(query, params)
    
    monthly_avg_temperature = {}
    for row in rows:
        month = int(row['month'])
        avg_temperature = round(float(row['avg_temperature']), 2)
        monthly_avg_temperature[month] = avg_temperature
    
    return monthly_avg_temperature


def _get_daily_temperature_for_month(db, month):
    """Get average temperature for each day of specified month"""
    query = """
        SELECT
            EXTRACT(DAY FROM timestamp) AS day,
            AVG(temperature_c) AS avg_temperature
        FROM sensor_readings
        WHERE EXTRACT(MONTH FROM timestamp) = %s
        AND DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
        GROUP BY day
        ORDER BY day;
    """
    rows = db.execute_query(query, (month,))
    
    daily_data = {}
    for row in rows:
        day = int(row['day'])
        avg_temperature = round(float(row['avg_temperature']), 2)
        daily_data[day] = avg_temperature
    
    return daily_data


def _get_daily_temperature_for_month_and_year(db, month, year):
    """Get average temperature for each day of specified month and year"""
    query = """
        SELECT
            EXTRACT(DAY FROM timestamp) AS day,
            AVG(temperature_c) AS avg_temperature
        FROM sensor_readings
        WHERE EXTRACT(MONTH FROM timestamp) = %s
        AND EXTRACT(YEAR FROM timestamp) = %s
        GROUP BY day
        ORDER BY day;
    """
    rows = db.execute_query(query, (month, year))
    
    daily_data = {}
    for row in rows:
        day = int(row['day'])
        avg_temperature = round(float(row['avg_temperature']), 2)
        daily_data[day] = avg_temperature
    
    return daily_data


def _get_monthly_average_temperature_by_year(db, year):
    """Get monthly average temperature for specified year"""
    return _get_average_monthly_temperature(db, year)


def _get_daily_temperature(db):
    """Get hourly temperature for current day"""
    query = """
        SELECT
            EXTRACT(HOUR FROM timestamp) AS hour,
            AVG(temperature_c) AS avg_temperature
        FROM sensor_readings
        WHERE DATE(timestamp) = CURRENT_DATE
        GROUP BY hour
        ORDER BY hour;
    """
    rows = db.execute_query(query)
    
    hourly_data = {}
    for row in rows:
        hour = int(row['hour'])
        avg_temperature = round(float(row['avg_temperature']), 2)
        hourly_data[hour] = avg_temperature
    
    return hourly_data


def _get_average_temperatures(db, start_dt, end_dt):
    """Get average temperatures for specified time range"""
    query = """
    SELECT DATE_TRUNC('hour', timestamp) AS hour, AVG(temperature_c) AS avg_temp
    FROM sensor_readings
    WHERE timestamp BETWEEN %s AND %s
    GROUP BY hour
    ORDER BY hour;
    """
    
    results = db.execute_query(query, (start_dt, end_dt))
    
    if results:
        return [{
            "hour": row['hour'].isoformat(),
            "avg_temperature": round(row['avg_temp'], 2)
        } for row in results]
    
    return []


def _get_hourly_humidity(db):
    """Get average humidity for each hour of current day"""
    query = """
        SELECT
            EXTRACT(HOUR FROM timestamp) AS hour,
            AVG(humidity) AS avg_humidity
        FROM sensor_readings
        WHERE DATE(timestamp) = CURRENT_DATE
        GROUP BY hour
        ORDER BY hour;
    """
    rows = db.execute_query(query)
    
    hourly_data = {}
    for row in rows:
        hour = int(row['hour'])
        avg_humidity = round(float(row['avg_humidity']), 2)
        hourly_data[hour] = avg_humidity
    
    return hourly_data


def _get_daily_humidity_for_month(db, month):
    """Get average humidity for each day of specified month"""
    query = """
        SELECT
            EXTRACT(DAY FROM timestamp) AS day,
            AVG(humidity) AS avg_humidity
        FROM sensor_readings
        WHERE EXTRACT(MONTH FROM timestamp) = %s
        AND DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
        GROUP BY day
        ORDER BY day;
    """
    rows = db.execute_query(query, (month,))
    
    daily_data = {}
    for row in rows:
        day = int(row['day'])
        avg_humidity = round(float(row['avg_humidity']), 2)
        daily_data[day] = avg_humidity
    
    return daily_data


def _get_average_humidity(db, start_dt, end_dt):
    """Get average humidity for specified time range"""
    query = """
    SELECT DATE_TRUNC('hour', timestamp) AS hour, AVG(humidity) AS avg_humidity
    FROM sensor_readings
    WHERE timestamp BETWEEN %s AND %s
    GROUP BY hour
    ORDER BY hour;
    """
    
    results = db.execute_query(query, (start_dt, end_dt))
    
    if results:
        return [{
            "hour": row['hour'].isoformat(),
            "avg_humidity": round(row['avg_humidity'], 2)
        } for row in results]
    
    return []