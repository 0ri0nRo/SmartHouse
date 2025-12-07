from flask import Blueprint, jsonify, render_template, request
from datetime import datetime
from models.database import handle_db_error
from services.sensor_service import SensorService
from config.settings import get_config
from client.PostgresClient import PostgresHandler
import requests

sensor_bp = Blueprint('sensor', __name__)
config = get_config()
sensor_service = SensorService(config['DB_CONFIG'])


@sensor_bp.route('/')
def index():
    """Main page showing sensor charts."""
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()

    labels = [f"{int(entry['hour'])}:00" for entry in data] if data else []
    temperatures = [entry['avg_temperature'] for entry in data] if data else []
    labels.reverse()
    temperatures.reverse()

    last_temperature = last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A'
    last_humidity = last_entry.get('humidity', 'N/A') if last_entry else 'N/A'

    return render_template('index.html',
                           labels=labels,
                           temperatures=temperatures,
                           last_temperature=last_temperature,
                           last_humidity=last_humidity)


@sensor_bp.route('/api_sensors')
@handle_db_error
def api_sensors():
    """API to get sensor data with statistics."""
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()

    if not data:
        return jsonify({'error': 'No data available.'}), 404

    try:
        min_temp = min(e['avg_temperature'] for e in data)
        max_temp = max(e['avg_temperature'] for e in data)

        hums = [e['humidity'] for e in data if e.get('humidity') is not None]
        min_hum = min(hums) if hums else None
        max_hum = max(hums) if hums else None
        avg_hum = (sum(hums) / len(hums)) if hums else None

        chart_temp = [f"{e['avg_temperature']:.2f}" for e in data]
        chart_hum = [f"{(e['humidity'] or 0):.2f}" for e in data]

        return jsonify({
            'temperature': {
                'current': f"{float(last_entry.get('temperature_c', 0)):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [f"{min_temp:.2f}", f"{max_temp:.2f}"],
                'chartData': chart_temp
            },
            'humidity': {
                'current': f"{float(last_entry.get('humidity', 0)):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [
                    f"{min_hum:.2f}" if min_hum is not None else "N/A",
                    f"{max_hum:.2f}" if max_hum is not None else "N/A"
                ],
                'average': f"{avg_hum:.2f}" if avg_hum is not None else "N/A",
                'chartData': chart_hum
            },
            'labels': [f"{int(entry['hour'])}:00" for entry in data]
        })
    except KeyError as e:
        return jsonify({'error': f'Missing key: {e}'}), 500


@sensor_bp.route('/api/today_temperature', methods=['GET'])
@handle_db_error
def api_today_temperature():
    """API for today's hourly temperature."""
    return jsonify(sensor_service.get_today_hourly_temperature())


@sensor_bp.route('/api/today_humidity', methods=['GET'])
@handle_db_error
def api_today_humidity():
    """API for today's hourly humidity."""
    return jsonify(sensor_service.get_today_hourly_humidity())


@sensor_bp.route('/api/monthly_temperature')
@handle_db_error
def api_monthly_temperature():
    """API for monthly temperature data."""
    return jsonify(sensor_service.get_monthly_temperature_data())


@sensor_bp.route('/api/monthly_average_temperature')
@handle_db_error
def api_monthly_avg_temp_default():
    """API for monthly average temperature (current year)."""
    return jsonify(sensor_service.get_monthly_average_temperature())


@sensor_bp.route('/api/monthly_average_temperature/<int:year>', methods=['GET'])
@handle_db_error
def api_monthly_avg_temp_by_year(year):
    """API for monthly average temperature for a specific year."""
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year.'}), 400
    return jsonify(sensor_service.get_monthly_average_temperature(year))


@sensor_bp.route('/api/daily_temperature/<int:month>/', methods=['GET'])
@handle_db_error
def api_daily_temp(month):
    """API for daily temperature of a specific month."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month.'}), 400
    data = sensor_service.get_daily_for_month(month)
    if not data:
        return jsonify({'error': 'No data for the month.'}), 404
    return jsonify(data)


@sensor_bp.route('/api/monthly_average_temperature/<int:month>/<int:year>', methods=['GET'])
@handle_db_error
def api_daily_temp_by_month_year(month, year):
    """API for daily temperature of a specific month/year."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month.'}), 400
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year.'}), 400
    data = sensor_service.get_daily_for_month(month, year)
    if not data:
        return jsonify({'error': 'No data.'}), 404
    return jsonify(data)


@sensor_bp.route('/api/temperature_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_temperature_average(start_datetime, end_datetime):
    """API for average temperature in a date range."""
    try:
        s = datetime.fromisoformat(start_datetime)
        e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO8601.'}), 400

    data = sensor_service.get_average_temperatures(s, e)
    if data is None:
        return jsonify({'error': 'Fetching error.'}), 500
    return jsonify(data), 200


@sensor_bp.route('/api/humidity_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_humidity_average(start_datetime, end_datetime):
    """API for average humidity in a date range."""
    try:
        s = datetime.fromisoformat(start_datetime)
        e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO8601.'}), 400

    data = sensor_service.get_average_humidity(s, e)
    if data is None:
        return jsonify({'error': 'Fetching error.'}), 500
    return jsonify(data), 200


@sensor_bp.route('/last_temp', methods=['GET'])
def last_temp():
    """API for the last recorded temperature."""
    try:
        from client.PostgresClient import PostgresHandler
        db = PostgresHandler(config['DB_CONFIG'])
        return db.last_temp_db()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"last_temp error: {e}")
        return jsonify({'error': 'Error occurred.'}), 500


# Template pages
@sensor_bp.route('/temp')
def page_temp():
    """Page to display temperature data."""
    return render_template('temperature.html')


@sensor_bp.route('/umid')
def page_umid():
    """Page to display humidity data."""
    return render_template('umid.html')


@sensor_bp.route('/api/monthly_average_humidity/<int:month>/<int:year>', methods=['GET'])
@handle_db_error
def api_daily_humidity_by_month_year(month, year):
    """API for daily humidity of a specific month/year."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Invalid month.'}), 400
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year.'}), 400
    data = sensor_service.get_daily_humidity_for_month(month, year)
    if not data:
        return jsonify({'error': 'No data.'}), 404
    return jsonify(data)


@sensor_bp.route('/api/monthly_average_humidity/<int:year>', methods=['GET'])
@handle_db_error
def api_monthly_avg_humidity_by_year(year):
    """API for monthly average humidity for a specific year."""
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year.'}), 400
    return jsonify(sensor_service.get_monthly_average_humidity(year))


@sensor_bp.route('/api/target_temperature', methods=['POST'])
@handle_db_error
def api_set_target_temperature():
    """API to set and overwrite target temperature."""
    data = request.get_json()

    if not data or 'target_temperature' not in data:
        return jsonify({'error': 'Missing target_temperature in request body.'}), 400

    try:
        target = float(data['target_temperature'])
    except ValueError:
        return jsonify({'error': 'target_temperature must be a number.'}), 400

    success = sensor_service.set_target_temperature(target)

    if not success:
        return jsonify({'error': 'Database error saving target temperature.'}), 500

    return jsonify({
        'status': 'success',
        'message': 'Target temperature updated.',
        'target_temperature': target
    }), 200

# GET target temperature
@sensor_bp.route('/api/target_temperature', methods=['GET'])
@handle_db_error
def api_get_target_temperature():
    value = sensor_service.get_target_temperature()  # usa il metodo del service
    return jsonify({'target_temperature': value}), 200

SHELLY_IP = "192.168.178.165" 

@sensor_bp.route('/api/thermostat/on', methods=['POST'])
@handle_db_error
def api_thermostat_on():
    # Aggiorna lo stato in DB
    success = sensor_service.set_thermostat_enabled(True)
    if not success:
        return jsonify({'error': 'Database error setting thermostat ON.'}), 500
    
    # Accende il relay Shelly
    try:
        r = requests.get(f"http://{SHELLY_IP}/relay/0?turn=on", timeout=3)
        if r.status_code != 200:
            return jsonify({"status": "error", "message": "Errore Shelly"}), 500
    except requests.RequestException as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "success", "message": "Thermostat enabled, caldaia accesa"}), 200


@sensor_bp.route('/api/thermostat/off', methods=['POST'])
@handle_db_error
def api_thermostat_off():
    success = sensor_service.set_thermostat_enabled(False)
    if not success:
        return jsonify({'error': 'Database error setting thermostat OFF.'}), 500

    try:
        r = requests.get(f"http://{SHELLY_IP}/relay/0?turn=off", timeout=3)
        if r.status_code != 200:
            return jsonify({"status": "error", "message": "Errore Shelly"}), 500
    except requests.RequestException as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "success", "message": "Thermostat disabled, caldaia spenta"}), 200


@sensor_bp.route('/api/boiler/status', methods=['GET'])
@handle_db_error
def get_boiler_status_route():
    status = sensor_service.get_boiler_status()
    # Assicuriamoci che sia un booleano corretto per JSON
    return jsonify({"is_on": bool(status)}), 200



@sensor_bp.route('/api/boiler/set', methods=['POST'])
@handle_db_error
def set_boiler_status_route():
    data = request.get_json()
    if not data or 'is_on' not in data:
        return jsonify({"error": "Missing is_on value"}), 400

    is_on = bool(data['is_on'])
    success = sensor_service.set_boiler_status(is_on)

    if not success:
        return jsonify({"error": "Database error"}), 500

    return jsonify({"status": "success", "is_on": is_on}), 200

@sensor_bp.route('/api/boiler/debug', methods=['GET'])
def debug_boiler_status():
    try:
        # Test query diretta
        row = sensor_service.db.execute_query(
            "SELECT is_on FROM boiler_status ORDER BY id DESC LIMIT 1;"
        )
        
        return jsonify({
            "row": str(row),
            "row_type": str(type(row)),
            "has_data": bool(row),
            "row_length": len(row) if row else 0,
            "first_element": str(row[0]) if row and len(row) > 0 else None,
            "value": str(row[0][0]) if row and len(row) > 0 else None,
            "value_type": str(type(row[0][0])) if row and len(row) > 0 else None
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500