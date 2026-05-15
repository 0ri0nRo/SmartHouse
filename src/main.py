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
        voltage = payload.get("voltage")

        if not device_name:
            logger.warning("Skipping Zigbee message without a device name on topic %s", topic)
            return

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



