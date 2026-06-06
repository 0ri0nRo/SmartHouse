# ══════════════════════════════════════════════════════════════════════════
# ZIGBEE SENSORS - Enhanced API Routes
# src/api/zigbee_routes_enhanced.py
# ══════════════════════════════════════════════════════════════════════════

from flask import Blueprint, jsonify, request
from contextlib import contextmanager
import psycopg2
import psycopg2.extras
import logging
from datetime import datetime
import json

from config.settings import get_config

logger = logging.getLogger(__name__)
config = get_config()

zigbee_bp = Blueprint('zigbee', __name__, url_prefix='/api/zigbee')


@contextmanager
def get_conn():
    """Context manager per connessione database."""
    conn = psycopg2.connect(
        **config['DB_CONFIG'],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        conn.close()


def serialize_datetime(obj):
    """Serializza datetime per JSON."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


# ══════════════════════════════════════════════════════════════════════════
# DEVICE REGISTRY - CRUD Endpoints
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/devices', methods=['GET'])
def get_all_devices():
    """
    GET /api/zigbee/devices
    Recupera tutti i dispositivi Zigbee registrati.
    Query params:
        - enabled: true/false - filtra per dispositivi abilitati
        - room_id: string - filtra per stanza
        - online: true/false - filtra per stato online
    """
    try:
        enabled_only = request.args.get('enabled', '').lower() == 'true'
        room_id = request.args.get('room_id')
        online_only = request.args.get('online', '').lower() == 'true'
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                query = """
                SELECT 
                    id, device_id, device_name, device_type, mqtt_topic,
                    manufacturer, model, room_id, room_name,
                    x_position, y_position, enabled, alert_enabled,
                    alert_min_temp, alert_max_temp, alert_min_humidity, alert_max_humidity,
                    online, last_seen, battery_level, signal_quality,
                    live_api_endpoint, created_at, updated_at
                FROM zigbee_device_registry
                WHERE 1=1
                """
                params = []
                
                if enabled_only:
                    query += " AND enabled = TRUE"
                
                if room_id:
                    query += " AND room_id = %s"
                    params.append(room_id)
                
                if online_only:
                    query += " AND online = TRUE"
                
                query += " ORDER BY room_id, device_name"
                
                cur.execute(query, params)
                rows = cur.fetchall()
        
        devices = [dict(row) for row in rows]
        
        # Serializza datetime
        for device in devices:
            device['last_seen'] = serialize_datetime(device.get('last_seen'))
            device['created_at'] = serialize_datetime(device.get('created_at'))
            device['updated_at'] = serialize_datetime(device.get('updated_at'))
        
        return jsonify({
            'devices': devices,
            'count': len(devices)
        })
        
    except Exception as e:
        logger.error(f"Error in get_all_devices: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>', methods=['GET'])
def get_device(device_id):
    """
    GET /api/zigbee/devices/<device_id>
    Recupera un singolo dispositivo.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, device_id, device_name, device_type, mqtt_topic,
                        manufacturer, model, room_id, room_name,
                        x_position, y_position, enabled, alert_enabled,
                        alert_min_temp, alert_max_temp, alert_min_humidity, alert_max_humidity,
                        online, last_seen, battery_level, signal_quality,
                        live_api_endpoint, created_at, updated_at
                    FROM zigbee_device_registry
                    WHERE device_id = %s
                """, (device_id,))
                row = cur.fetchone()
        
        if not row:
            return jsonify({'error': 'Device not found'}), 404
        
        device = dict(row)
        device['last_seen'] = serialize_datetime(device.get('last_seen'))
        device['created_at'] = serialize_datetime(device.get('created_at'))
        device['updated_at'] = serialize_datetime(device.get('updated_at'))
        
        return jsonify({'device': device})
        
    except Exception as e:
        logger.error(f"Error in get_device: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices', methods=['POST'])
def create_device():
    """
    POST /api/zigbee/devices
    Crea un nuovo dispositivo Zigbee.
    Body: {
        "device_id": "0x00124b001f2a3b4c",
        "device_name": "Kitchen Sensor",
        "device_type": "temperature",
        "mqtt_topic": "zigbee2mqtt/kitchen",
        "manufacturer": "Xiaomi",
        "model": "WSDCGQ11LM",
        "room_id": "cucina",
        "room_name": "Kitchen",
        "x_position": 20,
        "y_position": 25
    }
    """
    try:
        data = request.get_json()
        
        if not data.get('device_id'):
            return jsonify({'error': 'device_id is required'}), 400
        
        if not data.get('device_name'):
            return jsonify({'error': 'device_name is required'}), 400
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Verifica che il device_id non esista già
                cur.execute("SELECT device_id FROM zigbee_device_registry WHERE device_id = %s", 
                           (data['device_id'],))
                if cur.fetchone():
                    return jsonify({'error': 'Device already exists'}), 409
                
                # Inserisci il nuovo dispositivo
                cur.execute("""
                    INSERT INTO zigbee_device_registry (
                        device_id, device_name, device_type, mqtt_topic,
                        manufacturer, model, room_id, room_name,
                        x_position, y_position, enabled, alert_enabled,
                        alert_min_temp, alert_max_temp, alert_min_humidity, alert_max_humidity,
                        live_api_endpoint
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING device_id
                """, (
                    data['device_id'],
                    data.get('device_name', 'New Sensor'),
                    data.get('device_type', 'temperature'),
                    data.get('mqtt_topic'),
                    data.get('manufacturer'),
                    data.get('model'),
                    data.get('room_id'),
                    data.get('room_name'),
                    data.get('x_position', 50.0),
                    data.get('y_position', 50.0),
                    data.get('enabled', True),
                    data.get('alert_enabled', False),
                    data.get('alert_min_temp'),
                    data.get('alert_max_temp'),
                    data.get('alert_min_humidity'),
                    data.get('alert_max_humidity'),
                    data.get('live_api_endpoint'),
                ))
                
                device_id = cur.fetchone()['device_id']
        
        logger.info(f"Created device: {device_id}")
        return jsonify({
            'message': 'Device created successfully',
            'device_id': device_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error in create_device: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>', methods=['PUT', 'PATCH'])
def update_device(device_id):
    """
    PUT/PATCH /api/zigbee/devices/<device_id>
    Aggiorna un dispositivo esistente.
    """
    try:
        data = request.get_json()
        
        allowed_fields = {
            'device_name', 'device_type', 'mqtt_topic', 'manufacturer', 'model',
            'room_id', 'room_name', 'x_position', 'y_position', 'enabled',
            'alert_enabled', 'alert_min_temp', 'alert_max_temp',
            'alert_min_humidity', 'alert_max_humidity', 'online',
            'battery_level', 'signal_quality', 'live_api_endpoint'
        }
        
        updates = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Verifica che il device esista
                cur.execute("SELECT device_id FROM zigbee_device_registry WHERE device_id = %s", 
                           (device_id,))
                if not cur.fetchone():
                    return jsonify({'error': 'Device not found'}), 404
                
                # Costruisci la query UPDATE
                set_clause = ", ".join([f"{k} = %s" for k in updates.keys()])
                query = f"UPDATE zigbee_device_registry SET {set_clause} WHERE device_id = %s"
                values = list(updates.values()) + [device_id]
                
                cur.execute(query, values)
        
        logger.info(f"Updated device: {device_id}")
        return jsonify({'message': 'Device updated successfully'})
        
    except Exception as e:
        logger.error(f"Error in update_device: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>/position', methods=['PUT'])
def update_device_position(device_id):
    """
    PUT /api/zigbee/devices/<device_id>/position
    Aggiorna solo la posizione del dispositivo sulla mappa.
    Body: { "x": 45.5, "y": 67.3 }
    """
    try:
        data = request.get_json()
        
        x = data.get('x')
        y = data.get('y')
        
        if x is None or y is None:
            return jsonify({'error': 'x and y are required'}), 400
        
        # Limita i valori tra 0 e 100
        x = max(0, min(100, float(x)))
        y = max(0, min(100, float(y)))
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE zigbee_device_registry 
                    SET x_position = %s, y_position = %s
                    WHERE device_id = %s
                """, (x, y, device_id))
                
                if cur.rowcount == 0:
                    return jsonify({'error': 'Device not found'}), 404
        
        return jsonify({
            'message': 'Position updated successfully',
            'x': x,
            'y': y
        })
        
    except Exception as e:
        logger.error(f"Error in update_device_position: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>', methods=['DELETE'])
def delete_device(device_id):
    """
    DELETE /api/zigbee/devices/<device_id>
    Elimina un dispositivo (cascade su history e alerts).
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM zigbee_device_registry WHERE device_id = %s", (device_id,))
                
                if cur.rowcount == 0:
                    return jsonify({'error': 'Device not found'}), 404
        
        logger.info(f"Deleted device: {device_id}")
        return jsonify({'message': 'Device deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error in delete_device: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════
# SENSOR HISTORY & READINGS
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/readings/latest', methods=['GET'])
def get_latest_readings():
    """
    GET /api/zigbee/readings/latest
    Recupera l'ultima lettura di tutti i sensori.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, device_id, device_name, device_type, room_id, room_name,
                        x, y, enabled, online, last_seen, battery, signal_quality,
                        alert_enabled, topic, live_api_endpoint,
                        temperature, humidity, reading_timestamp
                    FROM zigbee_latest_readings
                    ORDER BY room_id, device_name
                """)
                rows = cur.fetchall()
        
        readings = []
        for row in rows:
            reading = dict(row)
            reading['last_seen'] = serialize_datetime(reading.get('last_seen'))
            reading['reading_timestamp'] = serialize_datetime(reading.get('reading_timestamp'))
            
            # Aggiungi live_api come oggetto se presente
            if reading.get('live_api_endpoint'):
                reading['live_api'] = {'endpoint': reading['live_api_endpoint']}
            
            readings.append(reading)
        
        return jsonify({
            'readings': readings,
            'count': len(readings)
        })
        
    except Exception as e:
        logger.error(f"Error in get_latest_readings: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>/history', methods=['GET'])
def get_device_history(device_id):
    """
    GET /api/zigbee/devices/<device_id>/history
    Recupera lo storico di un sensore.
    Query params:
        - hours: numero di ore di storico (default: 24, max: 168)
        - limit: massimo numero di record (default: 1000, max: 5000)
    """
    try:
        hours = min(int(request.args.get('hours', 24)), 168)
        limit = min(int(request.args.get('limit', 1000)), 5000)
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, device_id, temperature, humidity, battery, 
                        signal_quality, extra_data, timestamp
                    FROM zigbee_sensor_history
                    WHERE device_id = %s 
                      AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp DESC
                    LIMIT %s
                """, (device_id, hours, limit))
                rows = cur.fetchall()
        
        history = []
        for row in rows:
            record = dict(row)
            record['timestamp'] = serialize_datetime(record.get('timestamp'))
            history.append(record)
        
        return jsonify({
            'device_id': device_id,
            'history': history,
            'count': len(history),
            'hours': hours
        })
        
    except Exception as e:
        logger.error(f"Error in get_device_history: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/devices/<device_id>/readings', methods=['POST'])
def save_device_reading(device_id):
    """
    POST /api/zigbee/devices/<device_id>/readings
    Salva una nuova lettura per un sensore.
    Body: {
        "temperature": 22.5,
        "humidity": 65.3,
        "battery": 87,
        "signal_quality": 120,
        "extra_data": {"pressure": 1013.25}
    }
    """
    try:
        data = request.get_json()
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Verifica che il device esista
                cur.execute("SELECT device_id FROM zigbee_device_registry WHERE device_id = %s", 
                           (device_id,))
                if not cur.fetchone():
                    return jsonify({'error': 'Device not found'}), 404
                
                # Inserisci la lettura
                extra_data = json.dumps(data.get('extra_data')) if data.get('extra_data') else None
                
                cur.execute("""
                    INSERT INTO zigbee_sensor_history (
                        device_id, temperature, humidity, battery, 
                        signal_quality, extra_data, timestamp
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                """, (
                    device_id,
                    data.get('temperature'),
                    data.get('humidity'),
                    data.get('battery'),
                    data.get('signal_quality'),
                    extra_data
                ))
                
                reading_id = cur.fetchone()['id']
                
                # Aggiorna last_seen e online status
                cur.execute("""
                    UPDATE zigbee_device_registry
                    SET online = TRUE, 
                        last_seen = NOW(),
                        battery_level = COALESCE(%s, battery_level),
                        signal_quality = COALESCE(%s, signal_quality)
                    WHERE device_id = %s
                """, (data.get('battery'), data.get('signal_quality'), device_id))
        
        logger.info(f"Saved reading for device: {device_id}")
        return jsonify({
            'message': 'Reading saved successfully',
            'reading_id': reading_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error in save_device_reading: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/alerts', methods=['GET'])
def get_alerts():
    """
    GET /api/zigbee/alerts
    Recupera gli alert.
    Query params:
        - device_id: filtra per device_id
        - acknowledged: true/false
        - limit: max record (default: 50, max: 200)
    """
    try:
        device_id = request.args.get('device_id')
        acknowledged = request.args.get('acknowledged')
        limit = min(int(request.args.get('limit', 50)), 200)
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT 
                        a.id, a.device_id, r.device_name, a.alert_type, 
                        a.alert_message, a.alert_value, a.threshold_value,
                        a.severity, a.acknowledged, a.acknowledged_at, 
                        a.acknowledged_by, a.created_at
                    FROM zigbee_sensor_alerts a
                    JOIN zigbee_device_registry r ON a.device_id = r.device_id
                    WHERE 1=1
                """
                params = []
                
                if device_id:
                    query += " AND a.device_id = %s"
                    params.append(device_id)
                
                if acknowledged is not None:
                    query += " AND a.acknowledged = %s"
                    params.append(acknowledged.lower() == 'true')
                
                query += " ORDER BY a.created_at DESC LIMIT %s"
                params.append(limit)
                
                cur.execute(query, params)
                rows = cur.fetchall()
        
        alerts = []
        for row in rows:
            alert = dict(row)
            alert['acknowledged_at'] = serialize_datetime(alert.get('acknowledged_at'))
            alert['created_at'] = serialize_datetime(alert.get('created_at'))
            alerts.append(alert)
        
        return jsonify({
            'alerts': alerts,
            'count': len(alerts)
        })
        
    except Exception as e:
        logger.error(f"Error in get_alerts: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/alerts/<int:alert_id>/acknowledge', methods=['POST'])
def acknowledge_alert(alert_id):
    """
    POST /api/zigbee/alerts/<alert_id>/acknowledge
    Marca un alert come gestito.
    Body: { "acknowledged_by": "user@example.com" }
    """
    try:
        data = request.get_json() or {}
        acknowledged_by = data.get('acknowledged_by', 'system')
        
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE zigbee_sensor_alerts
                    SET acknowledged = TRUE, 
                        acknowledged_at = NOW(),
                        acknowledged_by = %s
                    WHERE id = %s
                """, (acknowledged_by, alert_id))
                
                if cur.rowcount == 0:
                    return jsonify({'error': 'Alert not found'}), 404
        
        return jsonify({'message': 'Alert acknowledged successfully'})
        
    except Exception as e:
        logger.error(f"Error in acknowledge_alert: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════
# STATISTICS & SUMMARY
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/summary', methods=['GET'])
def get_summary():
    """
    GET /api/zigbee/summary
    Riepilogo generale di tutti i sensori.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Statistiche generali
                cur.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE online = TRUE) as online,
                        COUNT(*) FILTER (WHERE alert_enabled = TRUE) as alert_enabled,
                        ROUND(AVG(temperature)::numeric, 1) as avg_temp,
                        ROUND(AVG(humidity)::numeric, 1) as avg_hum,
                        MIN(battery) as min_battery
                    FROM zigbee_latest_readings
                    WHERE enabled = TRUE
                """)
                stats = cur.fetchone()
                
                # Alert non gestiti
                cur.execute("SELECT COUNT(*) FROM zigbee_sensor_alerts WHERE acknowledged = FALSE")
                alerts_count = cur.fetchone()['count']
        
        return jsonify({
            'total': stats['total'] or 0,
            'online': stats['online'] or 0,
            'alert_enabled': stats['alert_enabled'] or 0,
            'alerts': alerts_count,
            'avg_temp': float(stats['avg_temp']) if stats['avg_temp'] else None,
            'avg_hum': float(stats['avg_hum']) if stats['avg_hum'] else None,
            'min_battery': stats['min_battery'],
        })
        
    except Exception as e:
        logger.error(f"Error in get_summary: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/rooms/statistics', methods=['GET'])
def get_room_statistics():
    """
    GET /api/zigbee/rooms/statistics
    Statistiche aggregate per stanza.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        room_id, room_name, total_sensors, online_sensors,
                        avg_temperature, avg_humidity, min_battery, active_alerts
                    FROM zigbee_room_statistics
                    ORDER BY room_id
                """)
                rows = cur.fetchall()
        
        stats = [dict(row) for row in rows]
        
        return jsonify({
            'rooms': stats,
            'count': len(stats)
        })
        
    except Exception as e:
        logger.error(f"Error in get_room_statistics: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════
# ZIGBEE2MQTT INTEGRATION
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/pairing/start', methods=['POST'])
def start_pairing():
    """
    POST /api/zigbee/pairing/start
    Avvia il pairing di un nuovo dispositivo Zigbee.
    Invia il comando a Zigbee2MQTT via MQTT.
    Body: { "duration": 60 }
    """
    try:
        # TODO: Implementa l'integrazione con MQTT per attivare il pairing
        # publish su 'zigbee2mqtt/bridge/request/permit_join' con payload {"value": true, "time": 60}
        
        data = request.get_json() or {}
        duration = data.get('duration', 60)
        
        # Placeholder - implementa la logica MQTT
        logger.info(f"Pairing mode activated for {duration} seconds")
        
        return jsonify({
            'message': 'Pairing mode activated',
            'duration': duration
        })
        
    except Exception as e:
        logger.error(f"Error in start_pairing: {e}")
        return jsonify({'error': str(e)}), 500


@zigbee_bp.route('/pairing/stop', methods=['POST'])
def stop_pairing():
    """
    POST /api/zigbee/pairing/stop
    Ferma il pairing.
    """
    try:
        # TODO: Implementa stop pairing via MQTT
        # publish su 'zigbee2mqtt/bridge/request/permit_join' con payload {"value": false}
        
        logger.info("Pairing mode deactivated")
        
        return jsonify({'message': 'Pairing mode deactivated'})
        
    except Exception as e:
        logger.error(f"Error in stop_pairing: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════

@zigbee_bp.route('/health', methods=['GET'])
def health_check():
    """Controlla lo stato del sistema Zigbee."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM zigbee_device_registry")
                device_count = cur.fetchone()['count']
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'total_devices': device_count
        })
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 503