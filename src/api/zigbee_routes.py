from flask import Blueprint, jsonify, request
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from config.settings import get_config


zigbee_bp = Blueprint('zigbee', __name__)
config = get_config()


@contextmanager
def get_conn():
    conn = psycopg2.connect(
        **config['DB_CONFIG'],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        yield conn
    finally:
        conn.close()


def ensure_zigbee_table():
    with get_conn() as conn:
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


def serialize_row(row):
    timestamp = row.get('timestamp')
    return {
        'id': row.get('id'),
        'device_name': row.get('device_name'),
        'temperature': row.get('temperature'),
        'humidity': row.get('humidity'),
        'battery': row.get('battery'),
        'timestamp': timestamp.isoformat() if timestamp else None,
    }


@zigbee_bp.route('/api/zigbee-sensors', methods=['GET'])
def zigbee_sensors():
    ensure_zigbee_table()
    limit = min(max(int(request.args.get('limit', 100)), 1), 1000)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, device_name, temperature, humidity, battery, timestamp
                FROM zigbee_sensors
                ORDER BY timestamp DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    readings = [serialize_row(row) for row in rows]
    return jsonify({
        'readings': readings,
        'count': len(readings),
    })


@zigbee_bp.route('/api/zigbee-sensors/latest', methods=['GET'])
def zigbee_latest():
    ensure_zigbee_table()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, device_name, temperature, humidity, battery, timestamp
                FROM zigbee_sensors
                ORDER BY timestamp DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()

    return jsonify({'latest': serialize_row(row) if row else None})