from flask import Blueprint, jsonify, render_template, request
from datetime import datetime, timezone
from contextlib import contextmanager
import json
from models.database import handle_db_error
from services.sensor_service import SensorService
from config.settings import get_config
from client.PostgresClient import PostgresHandler
import psycopg2
import psycopg2.extras
import requests
import logging
from utils.redis_cache import cache_json_response, invalidate_cached_paths

sensor_bp = Blueprint('sensor', __name__)
config = get_config()
sensor_service = SensorService(config['DB_CONFIG'])
logger = logging.getLogger(__name__)


@contextmanager
def get_conn():
    """Open a DB connection for sensor map CRUD APIs."""
    conn = psycopg2.connect(
        **config['DB_CONFIG'],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        yield conn
    finally:
        conn.close()


def ensure_sensor_map_tables():
    """Create tables needed by the sensor floorplan APIs if they are missing."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sensors (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    type VARCHAR(40) NOT NULL DEFAULT 'temp_hum',
                    room_id VARCHAR(40) DEFAULT '',
                    room_name VARCHAR(120) DEFAULT '',
                    topic VARCHAR(255) DEFAULT '',
                    x DOUBLE PRECISION NOT NULL DEFAULT 50,
                    y DOUBLE PRECISION NOT NULL DEFAULT 50,
                    temperature DOUBLE PRECISION,
                    humidity DOUBLE PRECISION,
                    last_seen TIMESTAMPTZ,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # Keep compatibility with existing installations where the table already exists.
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS room_id VARCHAR(40) DEFAULT '';")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS room_name VARCHAR(120) DEFAULT '';")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS topic VARCHAR(255) DEFAULT '';")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION DEFAULT 50;")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION DEFAULT 50;")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION;")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS humidity DOUBLE PRECISION;")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;")
            cur.execute("ALTER TABLE sensors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS sensor_readings (
                    id SERIAL PRIMARY KEY,
                    sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE,
                    temperature DOUBLE PRECISION,
                    humidity DOUBLE PRECISION,
                    extra JSONB DEFAULT '{}'::jsonb,
                    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            cur.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE;")
            cur.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION;")
            cur.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS humidity DOUBLE PRECISION;")
            cur.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;")
            cur.execute("ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT NOW();")

            cur.execute("CREATE INDEX IF NOT EXISTS idx_sensors_active ON sensors(active);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time ON sensor_readings(sensor_id, recorded_at DESC);")
        conn.commit()


try:
    ensure_sensor_map_tables()
except Exception as e:
    logger.exception(f"Unable to initialize sensor map tables: {e}")


@sensor_bp.route('/api_sensors')
@handle_db_error
@cache_json_response(ttl_seconds=30)
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
@cache_json_response(ttl_seconds=60)
def api_today_temperature():
    """API for today's hourly temperature."""
    return jsonify(sensor_service.get_today_hourly_temperature())


@sensor_bp.route('/api/today_humidity', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=60)
def api_today_humidity():
    """API for today's hourly humidity."""
    return jsonify(sensor_service.get_today_hourly_humidity())


@sensor_bp.route('/api/monthly_temperature')
@handle_db_error
@cache_json_response(ttl_seconds=1800)
def api_monthly_temperature():
    """API for monthly temperature data."""
    return jsonify(sensor_service.get_monthly_temperature_data())


@sensor_bp.route('/api/monthly_average_temperature')
@handle_db_error
@cache_json_response(ttl_seconds=1800)
def api_monthly_avg_temp_default():
    """API for monthly average temperature (current year)."""
    return jsonify(sensor_service.get_monthly_average_temperature())


@sensor_bp.route('/api/monthly_average_temperature/<int:year>', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=1800)
def api_monthly_avg_temp_by_year(year):
    """API for monthly average temperature for a specific year."""
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Invalid year.'}), 400
    return jsonify(sensor_service.get_monthly_average_temperature(year))


@sensor_bp.route('/api/daily_temperature/<int:month>/', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=1800)
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
@cache_json_response(ttl_seconds=1800)
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
@cache_json_response(ttl_seconds=600)
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
@cache_json_response(ttl_seconds=600)
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
@cache_json_response(ttl_seconds=30)
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


@sensor_bp.route('/api/monthly_average_humidity/<int:month>/<int:year>', methods=['GET'])
@handle_db_error
@cache_json_response(ttl_seconds=1800)
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


@sensor_bp.route('/api/target_temperature', methods=['GET'])
@handle_db_error
def api_get_target_temperature():
    value = sensor_service.get_target_temperature()
    return jsonify({'target_temperature': value}), 200


SHELLY_IP = "192.168.178.165"


@sensor_bp.route('/api/thermostat/on', methods=['POST'])
@handle_db_error
def api_thermostat_on():
    # ── Blackout check ──────────────────────────────────────
    blocked, reason = sensor_service.db.is_in_blackout_period()
    if blocked:
        return jsonify({
            'blocked': True,
            'reason': reason,
            'error': f'Boiler is disabled during this period: {reason}'
        }), 403

    success = sensor_service.set_thermostat_enabled(True)
    if not success:
        return jsonify({'error': 'Database error setting thermostat ON.'}), 500

    try:
        r = requests.get(f"http://{SHELLY_IP}/relay/0?turn=on", timeout=3)
        if r.status_code != 200:
            return jsonify({"status": "error", "message": "Shelly error"}), 500
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
            return jsonify({"status": "error", "message": "Shelly error"}), 500
    except requests.RequestException as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "success", "message": "Thermostat disabled, caldaia spenta"}), 200


@sensor_bp.route('/api/thermostat/status', methods=['GET'])
@handle_db_error
def api_thermostat_status():
    try:
        r = requests.get(f"http://{SHELLY_IP}/relay/0", timeout=3)

        if r.status_code != 200:
            return jsonify({"error": "Shelly error"}), 500

        data = r.json()
        return jsonify({"ison": data.get("ison")}), 200

    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


@sensor_bp.route('/api/boiler/status', methods=['GET'])
@handle_db_error
def get_boiler_status_route():
    status = sensor_service.get_boiler_status()
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


# ══════════════════════════════════════════════════════════════════════════════
# BOILER BLACKOUT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@sensor_bp.route('/api/boiler/blackout', methods=['GET'])
@handle_db_error
def api_get_boiler_blackout():
    """
    Returns the current boiler blackout period configuration.

    Response 200:
    {
        "enabled":     bool,
        "start_month": int,   // 1-12
        "start_day":   int,   // 1-31
        "end_month":   int,
        "end_day":     int,
        "reason":      str,
        "updated_at":  str | null,
        "currently_blocked": bool   // True if today is within the blocked period
    }
    """
    cfg = sensor_service.db.get_boiler_blackout()
    blocked, _ = sensor_service.db.is_in_blackout_period()
    cfg['currently_blocked'] = blocked
    return jsonify(cfg), 200


@sensor_bp.route('/api/boiler/blackout', methods=['PUT'])
@handle_db_error
def api_set_boiler_blackout():
    """
    Updates the boiler blackout period configuration.

    Body JSON atteso:
    {
        "enabled":     bool,
        "start_month": int,   // 1-12
        "start_day":   int,   // 1-31
        "end_month":   int,   // 1-12
        "end_day":     int,   // 1-31
        "reason":      str    // optional
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing JSON body'}), 400

    # Validate required fields
    required = ['enabled', 'start_month', 'start_day', 'end_month', 'end_day']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    # Validate values
    try:
        enabled     = bool(data['enabled'])
        start_month = int(data['start_month'])
        start_day   = int(data['start_day'])
        end_month   = int(data['end_month'])
        end_day     = int(data['end_day'])
        reason      = str(data.get('reason', 'Boiler disabled during this period')).strip()
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid field value: {e}'}), 400

    if not (1 <= start_month <= 12):
        return jsonify({'error': 'start_month must be between 1 and 12'}), 400
    if not (1 <= end_month <= 12):
        return jsonify({'error': 'end_month must be between 1 and 12'}), 400
    if not (1 <= start_day <= 31):
        return jsonify({'error': 'start_day must be between 1 and 31'}), 400
    if not (1 <= end_day <= 31):
        return jsonify({'error': 'end_day must be between 1 and 31'}), 400
    if not reason:
        return jsonify({'error': 'reason cannot be empty'}), 400

    success = sensor_service.db.set_boiler_blackout(
        enabled, start_month, start_day, end_month, end_day, reason
    )

    if not success:
        return jsonify({'error': 'Database error saving blackout configuration'}), 500

    # Return the updated configuration with the current block state
    cfg = sensor_service.db.get_boiler_blackout()
    blocked, _ = sensor_service.db.is_in_blackout_period()
    cfg['currently_blocked'] = blocked

    return jsonify({
        'status': 'success',
        'message': 'Blackout configuration updated',
        'config': cfg
    }), 200


### ------------------------------- ###
#  SHELLY SCHEDULE API (GEN3)
### -------------------------------

def shelly_rpc(method, params=None):
    """Helper per chiamate RPC a Shelly Gen3"""
    try:
        payload = {"id": 1, "method": method}
        if params:
            payload["params"] = params

        r = requests.post(f"http://{SHELLY_IP}/rpc", json=payload, timeout=3)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


@sensor_bp.route('/api/shelly/schedules', methods=['GET'])
def api_shelly_schedules():
    """Ottiene tutti gli scheduler configurati sullo Shelly"""
    return jsonify(shelly_rpc("Schedule.List"))


@sensor_bp.route('/api/shelly/schedule/create', methods=['POST'])
def api_shelly_schedule_create():
    """Create a new Shelly schedule - blocked during the blackout period."""
    data = request.json
    timespec = data.get('timespec')
    is_on    = data.get('is_on', True)

    if not timespec:
        return jsonify({'error': 'Missing timespec parameter'}), 400

    # ── Blackout check: only block new ON schedules ──────────
    if is_on:
        blocked, reason = sensor_service.db.is_in_blackout_period()
        if blocked:
            return jsonify({
                'blocked': True,
                'reason': reason,
                'error': f'Cannot create an ON schedule during blackout period: {reason}'
            }), 403

    result = shelly_rpc("Schedule.Create", {
        "enable": True,
        "timespec": timespec,
        "calls": [{
            "method": "Switch.Set",
            "params": {"id": 0, "on": is_on}
        }]
    })

    if "error" in result:
        return jsonify(result), 500

    return jsonify(result), 200


@sensor_bp.route('/api/shelly/schedule/delete', methods=['POST'])
def api_shelly_schedule_delete():
    """Delete a schedule from Shelly"""
    data = request.json
    schedule_id = data.get("id")

    if schedule_id is None:
        return jsonify({'error': 'Missing id parameter'}), 400

    result = shelly_rpc("Schedule.Delete", {"id": schedule_id})

    if "error" in result:
        return jsonify(result), 500

    return jsonify(result), 200


@sensor_bp.route('/api/thermostat/status/full', methods=['GET'])
@handle_db_error
def api_thermostat_status_full():
    """API to get the full thermostat status."""
    status = sensor_service.get_thermostat_status_full()
    if status is None:
        return jsonify({'error': 'Error retrieving thermostat status'}), 500
    return jsonify(status), 200


@sensor_bp.route('/api/thermostat/control', methods=['POST'])
@handle_db_error
def api_thermostat_manual_control():
    """
    API to manually run a thermostat control cycle.
    """
    result = sensor_service.thermostat_control_logic()
    return jsonify(result), 200


@sensor_bp.route('/api/thermostat/sync', methods=['POST'])
@handle_db_error
def api_thermostat_sync():
    """API to manually sync the state with Shelly."""
    success = sensor_service.sync_boiler_with_shelly()

    if success:
        return jsonify({
            'status': 'success',
            'message': 'Synchronization completed'
        }), 200
    else:
        return jsonify({
            'status': 'error',
            'message': 'Synchronization failed'
        }), 500


@sensor_bp.route('/api/thermostat/log', methods=['GET'])
@handle_db_error
def api_thermostat_log():
    """API to get the thermostat action log."""
    limit = request.args.get('limit', 50, type=int)
    log_entries = sensor_service.db.get_thermostat_log(limit)
    return jsonify(log_entries), 200


@sensor_bp.route('/api/boiler/manual', methods=['POST'])
@handle_db_error
def api_boiler_manual_control():
    """
    API for manual boiler control (thermostat bypass).
    The blackout is checked only when attempting to TURN ON.
    """
    data = request.get_json()

    if not data or 'turn_on' not in data:
        return jsonify({'error': 'Missing turn_on parameter'}), 400

    turn_on = bool(data['turn_on'])

    # ── Blackout check: solo per accensione, non per spegnimento ────────────
    if turn_on:
        blocked, reason = sensor_service.db.is_in_blackout_period()
        if blocked:
            return jsonify({
                'blocked': True,
                'reason': reason,
                'error': f'Boiler is disabled during this period: {reason}'
            }), 403

    # Disable the thermostat to avoid conflicts
    sensor_service.set_thermostat_enabled(False)

    # Physically control the Shelly
    shelly_success = sensor_service.control_shelly_relay(turn_on)

    if not shelly_success:
        return jsonify({
            'status': 'error',
            'message': 'Failed to control Shelly relay'
        }), 500

    # Update state in the DB
    sensor_service.set_boiler_status(turn_on)

    # Log the manual action
    sensor_service.db.log_thermostat_action(
        action="MANUAL_CONTROL",
        boiler_status=turn_on
    )

    return jsonify({
        'status': 'success',
        'message': f'Boiler turned {"on" if turn_on else "off"} manually',
        'thermostat_disabled': True
    }), 200

# ── Helper ────────────────────────────────────────────────────
def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d
 
 
# ── GET /api/sensors ──────────────────────────────────────────
@sensor_bp.route('/sensors', methods=['GET'])
@sensor_bp.route('/api/sensors', methods=['GET'])
@cache_json_response(ttl_seconds=30)
def list_sensors():
    """Return all sensors with their latest reading."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM sensors
                WHERE active = TRUE
                ORDER BY id
            """)
            rows = cur.fetchall()
    return jsonify([row_to_dict(r) for r in rows])
 
 
# ── POST /api/sensors ─────────────────────────────────────────
@sensor_bp.route('/sensors', methods=['POST'])
@sensor_bp.route('/api/sensors', methods=['POST'])
def create_sensor():
    """Create a new sensor with a position on the map."""
    body = request.get_json(silent=True) or {}
    name     = body.get('name', '').strip()
    type_    = body.get('type', 'temp_hum')
    room_id  = body.get('room_id', '')
    topic    = body.get('topic', '')

    try:
        x = float(body.get('x', 50))
        y = float(body.get('y', 50))
    except (ValueError, TypeError):
        return jsonify({'error': 'x e y devono essere numeri validi'}), 400
 
    if not name:
        return jsonify({'error': 'name richiesto'}), 400
 
    # Map room_id -> room_name
    ROOM_NAMES = {
        'camera1':   'Camera da letto',
        'ufficio':   'Ufficio',
        'cucina':    'Cucina',
        'sala':      'Sala da pranzo',
        'bagno':     'Bagno',
        'camera2':   'Camera da letto 2',
        'corridoio': 'Hallway',
    }
    room_name = ROOM_NAMES.get(room_id, '')
 
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO sensors (name, type, room_id, room_name, topic, x, y)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (name, type_, room_id, room_name, topic, x, y))
            conn.commit()
            row = cur.fetchone()

    invalidate_cached_paths(
        '/api/sensors',
        '/sensors',
        '/api_sensors',
        '/api/today_temperature',
        '/api/today_humidity',
        '/api/monthly_temperature',
        '/api/monthly_average_temperature',
        '/api/monthly_average_humidity',
        '/api/temperature_average',
        '/api/humidity_average',
        '/last_temp',
    )
 
    return jsonify(row_to_dict(row)), 201
 
 
# ── GET /api/sensors/<id> ─────────────────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>', methods=['GET'])
@sensor_bp.route('/api/sensors/<int:sensor_id>', methods=['GET'])
@cache_json_response(ttl_seconds=30)
def get_sensor(sensor_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM sensors WHERE id = %s", (sensor_id,))
            row = cur.fetchone()
    if not row:
        return jsonify({'error': 'non trovato'}), 404
    invalidate_cached_paths(
        '/api/sensors',
        '/sensors',
        '/api_sensors',
        '/api/today_temperature',
        '/api/today_humidity',
        '/api/monthly_temperature',
        '/api/monthly_average_temperature',
        '/api/monthly_average_humidity',
        '/api/temperature_average',
        '/api/humidity_average',
        '/last_temp',
    )
    return jsonify(row_to_dict(row))
 
 
# ── PUT /api/sensors/<id> ─────────────────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>', methods=['PUT'])
@sensor_bp.route('/api/sensors/<int:sensor_id>', methods=['PUT'])
def update_sensor(sensor_id):
    """Aggiorna metadati sensore (nome, tipo, stanza, topic)."""
    body = request.get_json()
 
    ROOM_NAMES = {
        'camera1': 'Camera da letto', 'ufficio': 'Ufficio',
        'cucina': 'Cucina', 'sala': 'Sala da pranzo',
        'bagno': 'Bagno', 'camera2': 'Camera da letto 2',
        'corridoio': 'Hallway',
    }
    room_id   = body.get('room_id', '')
    room_name = ROOM_NAMES.get(room_id, '')
 
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE sensors
                SET name      = COALESCE(%s, name),
                    type      = COALESCE(%s, type),
                    room_id   = %s,
                    room_name = %s,
                    topic     = COALESCE(%s, topic)
                WHERE id = %s
                RETURNING *
            """, (
                body.get('name'), body.get('type'),
                room_id, room_name,
                body.get('topic'), sensor_id
            ))
            conn.commit()
            row = cur.fetchone()
 
    if not row:
        return jsonify({'error': 'non trovato'}), 404
    return jsonify(row_to_dict(row))
 
 
# ── PATCH /api/sensors/<id>/position ─────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>/position', methods=['PATCH'])
@sensor_bp.route('/api/sensors/<int:sensor_id>/position', methods=['PATCH'])
def update_position(sensor_id):
    """Update only the X/Y position on the map (drag & drop)."""
    body = request.get_json(silent=True) or {}
    try:
        x = float(body.get('x', 0))
        y = float(body.get('y', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'x e y devono essere numeri validi'}), 400
 
    # Clamp 0-100
    x = max(0.0, min(100.0, x))
    y = max(0.0, min(100.0, y))
 
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE sensors SET x = %s, y = %s WHERE id = %s RETURNING id, x, y
            """, (x, y, sensor_id))
            conn.commit()
            row = cur.fetchone()
 
    if not row:
        return jsonify({'error': 'non trovato'}), 404
    invalidate_cached_paths('/api/sensors', '/sensors')
    return jsonify(row_to_dict(row))
 
 
# ── DELETE /api/sensors/<id> ──────────────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>', methods=['DELETE'])
@sensor_bp.route('/api/sensors/<int:sensor_id>', methods=['DELETE'])
def delete_sensor(sensor_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE sensors SET active = FALSE WHERE id = %s RETURNING id
            """, (sensor_id,))
            conn.commit()
            row = cur.fetchone()
    if not row:
        return jsonify({'error': 'non trovato'}), 404
    invalidate_cached_paths(
        '/api/sensors',
        '/sensors',
        '/api_sensors',
        '/api/today_temperature',
        '/api/today_humidity',
        '/api/monthly_temperature',
        '/api/monthly_average_temperature',
        '/api/monthly_average_humidity',
        '/api/temperature_average',
        '/api/humidity_average',
        '/last_temp',
    )
    return jsonify({'ok': True, 'id': sensor_id})
 
 
# ── POST /api/sensors/<id>/reading ───────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>/reading', methods=['POST'])
@sensor_bp.route('/api/sensors/<int:sensor_id>/reading', methods=['POST'])
def post_reading(sensor_id):
    """
    Endpoint chiamato dal Raspberry Pi / MQTT bridge per aggiornare
    temperature/humidity and save the historical reading.
 
    Body JSON:
    {
        "temperature": 22.5,
        "humidity": 58.0,
        "extra": {}   // optional
    }
    """
    body = request.get_json()
    temp     = body.get('temperature')
    humidity = body.get('humidity')
    extra    = body.get('extra', {})
    now      = datetime.now(timezone.utc)
 
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Update sensor live values
            cur.execute("""
                UPDATE sensors
                SET temperature = COALESCE(%s, temperature),
                    humidity    = COALESCE(%s, humidity),
                    last_seen   = %s
                WHERE id = %s AND active = TRUE
                RETURNING id
            """, (temp, humidity, now, sensor_id))
 
            if cur.rowcount == 0:
                conn.rollback()
                return jsonify({'error': 'sensore non trovato'}), 404
 
            # Insert historical reading
            cur.execute("""
                INSERT INTO sensor_readings (sensor_id, temperature, humidity, extra, recorded_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (sensor_id, temp, humidity, json.dumps(extra), now))
 
            conn.commit()

    invalidate_cached_paths(
        '/api_sensors',
        '/api/today_temperature',
        '/api/today_humidity',
        '/api/monthly_temperature',
        '/api/monthly_average_temperature',
        '/api/monthly_average_humidity',
        '/api/temperature_average',
        '/api/humidity_average',
        '/last_temp',
        '/api/sensors',
        '/sensors',
        '/api/sensors/summary',
    )
 
    return jsonify({'ok': True, 'sensor_id': sensor_id, 'recorded_at': now.isoformat()})
 
 
# ── GET /api/sensors/<id>/history ────────────────────────────
@sensor_bp.route('/sensors/<int:sensor_id>/history', methods=['GET'])
@sensor_bp.route('/api/sensors/<int:sensor_id>/history', methods=['GET'])
@cache_json_response(ttl_seconds=300)
def get_history(sensor_id):
    """
    Restituisce le ultime N letture storiche.
    Query params: ?limit=100&hours=24
    """
    limit = min(int(request.args.get('limit', 100)), 1000)
    hours = int(request.args.get('hours', 24))
 
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, temperature, humidity, extra, recorded_at
                FROM sensor_readings
                WHERE sensor_id = %s
                  AND recorded_at >= NOW() - INTERVAL '%s hours'
                ORDER BY recorded_at DESC
                LIMIT %s
            """, (sensor_id, hours, limit))
            rows = cur.fetchall()
 
    return jsonify([row_to_dict(r) for r in reversed(rows)])
 
 
# ── GET /api/sensors/summary ──────────────────────────────────
@sensor_bp.route('/sensors/summary', methods=['GET'])
@sensor_bp.route('/api/sensors/summary', methods=['GET'])
@cache_json_response(ttl_seconds=30)
def sensors_summary():
    """Aggregated statistics for the dashboard."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE active)                 AS total,
                    COUNT(*) FILTER (WHERE active AND last_seen > NOW() - INTERVAL '5 min') AS online,
                    ROUND(AVG(temperature)::numeric, 1)            AS avg_temp,
                    ROUND(AVG(humidity)::numeric, 1)               AS avg_hum,
                    MAX(temperature)                               AS max_temp,
                    MIN(temperature)                               AS min_temp,
                    COUNT(*) FILTER (WHERE temperature > 28 OR humidity > 75) AS alerts
                FROM sensors
                WHERE active = TRUE
            """)
            row = cur.fetchone()
    return jsonify(row_to_dict(row))
