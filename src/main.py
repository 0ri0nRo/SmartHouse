from sensor_reader import SensorReader
from dotenv import load_dotenv
from thermostat_daemon import ThermostatDaemon
import json
import logging
import os
import threading
import time

import paho.mqtt.client as mqtt
import psycopg2
from psycopg2 import extras
from utils.redis_cache import invalidate_cached_paths


logger = logging.getLogger(__name__)

# Load environment variables from the .env file
load_dotenv()


def get_db_config():
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "database": os.getenv("DB_DATABASE", "sensor_data"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "1234"),
        "port": int(os.getenv("DB_PORT", "5432")),
    }


def ensure_zigbee_table():
    with psycopg2.connect(**get_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS zigbee_sensors (
                    id SERIAL PRIMARY KEY,
                    device_name TEXT NOT NULL,
                    temperature DOUBLE PRECISION,
                    humidity DOUBLE PRECISION,
                    battery INTEGER,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        conn.commit()


def insert_zigbee_reading(device_name, temperature, humidity, battery):
    with psycopg2.connect(**get_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO zigbee_sensors (device_name, temperature, humidity, battery)
                VALUES (%s, %s, %s, %s)
                """,
                (device_name, temperature, humidity, battery),
            )
        conn.commit()


def insert_sensor_reading(sensor_id, temperature, humidity, payload):
    with psycopg2.connect(**get_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sensor_readings (
                    temperature_c,
                    humidity,
                    timestamp,
                    sensor_id,
                    temperature,
                    extra,
                    recorded_at
                )
                VALUES (%s, %s, NOW()::timestamp, %s, %s, %s, NOW())
                """,
                (temperature, humidity, sensor_id, temperature, extras.Json(payload)),
            )
        conn.commit()
    invalidate_cached_paths(f'/api/sensors/{sensor_id}/history', f'/sensors/{sensor_id}/history')


def sync_sensor_registry(device_name, topic, payload, temperature, humidity, battery, signal_quality):
    default_room_id = os.getenv('ZIGBEE_DEFAULT_ROOM_ID', 'bagno')
    default_room_name = os.getenv('ZIGBEE_DEFAULT_ROOM_NAME', 'Bagno')
    default_x = float(os.getenv('ZIGBEE_DEFAULT_X', '64'))
    default_y = float(os.getenv('ZIGBEE_DEFAULT_Y', '64'))

    with psycopg2.connect(**get_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM sensors
                WHERE topic = %s OR device_name = %s OR name = %s
                ORDER BY id
                LIMIT 1
                """,
                (topic, device_name, device_name),
            )
            row = cur.fetchone()

            if row:
                cur.execute(
                    """
                    UPDATE sensors
                    SET name = COALESCE(%s, name),
                        device_name = COALESCE(%s, device_name),
                        temperature = COALESCE(%s, temperature),
                        humidity = COALESCE(%s, humidity),
                        battery = COALESCE(%s, battery),
                        signal_quality = COALESCE(%s, signal_quality),
                        online = TRUE,
                        last_seen = NOW(),
                        last_payload = %s,
                        active = TRUE,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        device_name,
                        device_name,
                        temperature,
                        humidity,
                        battery,
                        signal_quality,
                        extras.Json(payload),
                        row[0],
                    ),
                )
                sensor_id = row[0]
            else:
                cur.execute(
                    """
                    INSERT INTO sensors (
                        name, type, room_id, room_name, topic, device_name,
                        x, y, temperature, humidity, battery, signal_quality,
                        online, last_seen, last_payload, active
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, NOW(), %s, TRUE)
                    """,
                    (
                        device_name,
                        'temp_hum',
                        default_room_id,
                        default_room_name,
                        topic,
                        device_name,
                        default_x,
                        default_y,
                        temperature,
                        humidity,
                        battery,
                        signal_quality,
                        extras.Json(payload),
                    ),
                )
                cur.execute(
                    """
                    SELECT id
                    FROM sensors
                    WHERE topic = %s OR device_name = %s OR name = %s
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (topic, device_name, device_name),
                )
                created = cur.fetchone()
                sensor_id = created[0] if created else None

        conn.commit()
    return sensor_id


def seed_zigbee_from_state_file():
    state_path = os.getenv('ZIGBEE_STATE_PATH', '/zigbee2mqtt/data/state.json')
    if not os.path.exists(state_path):
        return

    try:
        with open(state_path, 'r', encoding='utf-8') as handle:
            state_data = json.load(handle)
    except Exception as exc:
        logger.warning('Unable to read Zigbee state file %s: %s', state_path, exc)
        return

    if not isinstance(state_data, dict):
        return

    for device_name, payload in state_data.items():
        if not isinstance(payload, dict):
            continue

        temperature = payload.get('temperature')
        humidity = payload.get('humidity')
        battery = payload.get('battery')

        if temperature is None and humidity is None and battery is None:
            continue

        try:
            topic = f"zigbee2mqtt/{device_name}"
            sensor_id = sync_sensor_registry(
                str(device_name),
                topic,
                payload,
                float(temperature) if temperature is not None else None,
                float(humidity) if humidity is not None else None,
                int(battery) if battery is not None else None,
                payload.get('linkquality'),
            )
            if sensor_id is not None:
                insert_sensor_reading(
                    sensor_id,
                    float(temperature) if temperature is not None else None,
                    float(humidity) if humidity is not None else None,
                    payload,
                )
            insert_zigbee_reading(
                str(device_name),
                float(temperature) if temperature is not None else None,
                float(humidity) if humidity is not None else None,
                int(battery) if battery is not None else None,
            )
            logger.info('Seeded Zigbee reading from state file for %s', device_name)
        except Exception as exc:
            logger.warning('Failed to seed Zigbee reading for %s: %s', device_name, exc)


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        logger.info("Connected to MQTT broker, subscribing to zigbee2mqtt/#")
        client.subscribe("zigbee2mqtt/#")
    else:
        logger.error("MQTT connection failed with reason code %s", reason_code)


def on_message(client, userdata, msg):
    topic = msg.topic or ""
    if "bridge" in topic.lower():
        return

    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except json.JSONDecodeError:
        logger.warning("Skipping invalid JSON on topic %s", topic)
        return

    if not isinstance(payload, dict):
        return

    try:
        device_name = payload.get("friendly_name") or topic.split("zigbee2mqtt/", 1)[-1]
        temperature = float(payload.get("temperature")) if payload.get("temperature") is not None else None
        humidity = float(payload.get("humidity")) if payload.get("humidity") is not None else None
        battery = int(payload.get("battery")) if payload.get("battery") is not None else None
        signal_quality = payload.get("linkquality")
        voltage = payload.get("voltage")

        if not device_name:
            logger.warning("Skipping Zigbee message without a device name on topic %s", topic)
            return

        sensor_id = sync_sensor_registry(device_name, topic, payload, temperature, humidity, battery, signal_quality)
        if sensor_id is not None:
            insert_sensor_reading(sensor_id, temperature, humidity, payload)
        insert_zigbee_reading(device_name, temperature, humidity, battery)
        logger.info(
            "Stored Zigbee reading for %s (temp=%s, humidity=%s, battery=%s, voltage=%s)",
            device_name,
            temperature,
            humidity,
            battery,
            voltage,
        )
    except (TypeError, ValueError, psycopg2.Error) as exc:
        logger.exception("Failed to store Zigbee reading from topic %s: %s", topic, exc)


def run_zigbee_mqtt_subscriber():
    ensure_zigbee_table()
    seed_zigbee_from_state_file()

    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    mqtt_host = os.getenv("MQTT_HOST", "mqtt-broker")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))

    while True:
        try:
            logger.info("Connecting to MQTT broker at %s:%s", mqtt_host, mqtt_port)
            client.connect(mqtt_host, mqtt_port, keepalive=60)
            client.loop_forever(retry_first_connection=True)
        except Exception as exc:
            logger.exception("MQTT subscriber stopped unexpectedly: %s", exc)
            time.sleep(5)

def main():
    """Funzione principale per eseguire il programma."""
    port = '/dev/ttyACM0'  # Porta seriale
    baud_rate = 9600  # Baud rate
    timeout = 10  # Timeout in secondi

    mqtt_thread = threading.Thread(
        target=run_zigbee_mqtt_subscriber,
        daemon=True,
    )
    mqtt_thread.start()
        
    reader = SensorReader(port, baud_rate, timeout)
    thermostat = ThermostatDaemon()
    thermostat_thread = threading.Thread(
        target=thermostat.run,
        daemon=True
    )
    thermostat_thread.start()
    reader.read_data()


if __name__ == "__main__":
    main()



