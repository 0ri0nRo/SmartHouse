# app.py (refactorato, tutto in un file)
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
import logging
import json
from decimal import Decimal
from datetime import datetime, timedelta
import traceback

# DB / clients / util imports (mantengo come nel tuo progetto)
import psycopg2
import psycopg2.extras
from psycopg2 import Error
import psutil
import nmap
import subprocess
import paramiko
from io import StringIO
from bson import ObjectId

# Moduli locali (mantengo gli import così come li avevi)
from scraper import TrainScraper
from client.PostgresClient import PostgresHandler
from client.MongoClient import MongoDBHandler
from send_email import EmailSender, invia_backup_email
from expenses_gsheet import GoogleSheetExpenseManager, SheetValueFetcher

# ---------------------
# Config / setup
# ---------------------
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
credentials_path = os.path.join(BASE_DIR, "gcredentials.json")
sheet_name = "My NW"

# Flask app
app = Flask(__name__)
CORS(app)

# Custom JSON encoder (gestisce Decimal e datetime)
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

app.json_encoder = CustomJSONEncoder

# Env / clients
URI = os.getenv('MONGO_URI')
db_handler = MongoDBHandler(URI, 'local', 'lista_spesa')

db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

db = PostgresHandler(db_config)

smtp_server = os.getenv('SMTP_SERVER')
smtp_port = os.getenv('SMTP_PORT')
username = os.getenv('EMAIL_USERNAME')
password = os.getenv('EMAIL_PASSWORD')
email_sender = EmailSender(smtp_server, smtp_port, username, password)

manager = GoogleSheetExpenseManager(credentials_path, sheet_name)

# ---------------------
# Utils / Decorators
# ---------------------
def get_db_connection():
    try:
        conn = psycopg2.connect(**db_config)
        return conn
    except Exception as e:
        logger.error(f"DB conn error: {e}")
        raise

def handle_db_error(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except psycopg2.OperationalError as e:
            logger.error(f"OperationalError in {func.__name__}: {e}")
            return jsonify({'error': 'Database connection error', 'message': str(e)}), 503
        except psycopg2.Error as e:
            logger.error(f"Database error in {func.__name__}: {e}")
            return jsonify({'error': 'Database error', 'message': str(e)}), 500
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")
            logger.debug(traceback.format_exc())
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
    wrapper.__name__ = func.__name__
    return wrapper

# ---------------------
# Services
# ---------------------
class BaseService:
    def __init__(self, db_conf):
        self.db_conf = db_conf

    def _connect(self):
        return psycopg2.connect(**self.db_conf)

class SensorService(BaseService):
    def get_hourly_today(self):
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
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            rows = cur.fetchall()
            return rows
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_latest(self):
        query = "SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            row = cur.fetchone()
            return row
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_monthly_temperature_data(self, year=None):
        if year is None:
            year = datetime.now().year
        query = """
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                EXTRACT(DAY FROM timestamp) AS day,
                ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY month, day
            ORDER BY month, day;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, (year,))
            rows = cur.fetchall()
            monthly = {}
            for row in rows:
                m = int(row['month']); d = int(row['day']); t = float(row['avg_temperature'])
                monthly.setdefault(m, {})[d] = t
            return monthly
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_monthly_average_temperature(self, year=None):
        if year is None:
            year = datetime.now().year
        query = """
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY month
            ORDER BY month;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, (year,))
            rows = cur.fetchall()
            return {int(r['month']): float(r['avg_temperature']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_daily_for_month(self, month, year=None):
        if year is None:
            year = datetime.now().year
        query = """
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(MONTH FROM timestamp) = %s
            AND EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY day
            ORDER BY day;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, (month, year))
            rows = cur.fetchall()
            return {int(r['day']): float(r['avg_temperature']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_today_hourly_temperature(self):
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            rows = cur.fetchall()
            return {int(r['hour']): float(r['avg_temperature']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_today_hourly_humidity(self):
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            rows = cur.fetchall()
            return {int(r['hour']): float(r['avg_humidity']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_average_temperatures(self, start_dt, end_dt):
        query = """
            SELECT DATE_TRUNC('hour', timestamp) AS hour, 
                   ROUND(AVG(temperature_c)::numeric, 2) AS avg_temp
            FROM sensor_readings
            WHERE timestamp BETWEEN %s AND %s
            GROUP BY hour
            ORDER BY hour;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, (start_dt, end_dt))
            rows = cur.fetchall()
            return [{"hour": r['hour'].isoformat(), "avg_temperature": float(r['avg_temp'])} for r in rows]
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_average_humidity(self, start_dt, end_dt):
        query = """
            SELECT DATE_TRUNC('hour', timestamp) AS hour, 
                   ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
            FROM sensor_readings
            WHERE timestamp BETWEEN %s AND %s
            GROUP BY hour
            ORDER BY hour;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, (start_dt, end_dt))
            rows = cur.fetchall()
            return [{"hour": r['hour'].isoformat(), "avg_humidity": float(r['avg_humidity'])} for r in rows]
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_last_temperature(self):
        query = "SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            r = cur.fetchone()
            if r:
                return {'temperature_c': float(r['temperature_c']), 'humidity': float(r['humidity']) if r['humidity'] else None, 'timestamp': r['timestamp'].isoformat()}
            return None
        finally:
            if cur: cur.close()
            if conn: conn.close()

class AirQualityService(BaseService):
    def get_latest(self):
        query = """
            SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp,
                   EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
            FROM air_quality
            ORDER BY timestamp DESC, id DESC
            LIMIT 1;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(query)
            r = cur.fetchone()
            if r:
                data = dict(r)
                data['smoke'] = float(data['smoke'])
                data['lpg'] = float(data['lpg'])
                data['methane'] = float(data['methane'])
                data['hydrogen'] = float(data['hydrogen'])
                data['air_quality_index'] = float(data['air_quality_index'])
                data['timestamp'] = data['timestamp'].isoformat()
                data['data_age_seconds'] = int(data['seconds_ago'])
                data['is_recent'] = data['seconds_ago'] < 300
                return data
            return None
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def insert_record(self, payload: dict):
        required_fields = ['smoke', 'lpg', 'methane', 'hydrogen', 'air_quality_index', 'air_quality_description']
        for f in required_fields:
            if f not in payload:
                raise ValueError(f"Missing field: {f}")

        # validation
        smoke = float(payload['smoke']); lpg = float(payload['lpg']); methane = float(payload['methane']); hydrogen = float(payload['hydrogen'])
        aqi = float(payload['air_quality_index']); desc = str(payload['air_quality_description']).strip()
        if not (0 <= smoke <= 1000): raise ValueError("smoke out of range")
        if not (0 <= lpg <= 1000): raise ValueError("lpg out of range")
        if not (0 <= methane <= 1000): raise ValueError("methane out of range")
        if not (0 <= hydrogen <= 1000): raise ValueError("hydrogen out of range")
        if not (0 <= aqi <= 500): raise ValueError("aqi out of range")
        if not desc: raise ValueError("desc empty")

        query = """
            INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, timestamp;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            timestamp = datetime.now()
            cur.execute(query, (smoke, lpg, methane, hydrogen, aqi, desc, timestamp))
            res = cur.fetchone()
            conn.commit()
            return {'id': res['id'], 'timestamp': res['timestamp'].isoformat()}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_daily_aggregated(self):
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(air_quality_index)::numeric, 2) AS avg_air_quality_index,
                COUNT(*) as measurement_count,
                MIN(air_quality_index) as min_aqi,
                MAX(air_quality_index) as max_aqi
            FROM air_quality
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY EXTRACT(HOUR FROM timestamp)
            ORDER BY hour;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(query)
            rows = cur.fetchall()
            data = {}
            for r in rows:
                h = int(r['hour'])
                data[h] = {
                    'avg_air_quality_index': float(r['avg_air_quality_index']),
                    'measurement_count': int(r['measurement_count']),
                    'min_aqi': float(r['min_aqi']),
                    'max_aqi': float(r['max_aqi'])
                }
            return data
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_hourly_gas_concentration(self):
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
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(query)
            rows = cur.fetchall()
            if not rows:
                # return placeholder for 24h
                return {str(h): {'avg_smoke': 0.0, 'avg_lpg': 0.0, 'avg_methane': 0.0, 'avg_hydrogen': 0.0, 'measurement_count': 0} for h in range(24)}
            out = {}
            for r in rows:
                hour = str(int(r['hour']))
                out[hour] = {
                    'avg_smoke': float(r['avg_smoke'] or 0),
                    'avg_lpg': float(r['avg_lpg'] or 0),
                    'avg_methane': float(r['avg_methane'] or 0),
                    'avg_hydrogen': float(r['avg_hydrogen'] or 0),
                    'measurement_count': int(r['measurement_count'])
                }
            return out
        finally:
            if cur: cur.close()
            if conn: conn.close()

class NetworkService(BaseService):
    def scan_network(self, network='192.168.178.0/24'):
        nm = nmap.PortScanner()
        nm.scan(hosts=network, arguments='-sn')
        devices = {}
        for host in nm.all_hosts():
            hostname = nm[host].hostname() or 'Unknown'
            devices[host] = {'hostname': hostname, 'status': nm[host].state()}
        # save to db
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_conf)
            cur = conn.cursor()
            cur.execute("""
            CREATE TABLE IF NOT EXISTS network_devices (
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45) NOT NULL,
                hostname VARCHAR(255),
                status VARCHAR(50),
                timestamp TIMESTAMP NOT NULL
            );
            """)
            conn.commit()
            ts = datetime.now()
            insert_q = "INSERT INTO network_devices (ip_address, hostname, status, timestamp) VALUES (%s, %s, %s, %s)"
            for ip, info in devices.items():
                cur.execute(insert_q, (ip, info['hostname'], info['status'], ts))
            conn.commit()
        except Exception as e:
            logger.error(f"Error saving network devices: {e}")
        finally:
            if cur: cur.close()
            if conn: conn.close()
        return devices

    def get_device_stats(self):
        query = """
            SELECT hostname, COUNT(*) AS connection_count
            FROM network_devices
            WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
            GROUP BY hostname
            ORDER BY connection_count DESC;
        """
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_conf)
            cur = conn.cursor()
            cur.execute(query)
            stats = cur.fetchall()
            result = []
            for stat in stats:
                hostname = (stat[0] or '')[:-10]
                if not hostname:
                    hostname = "Fritzbox-modem1234567890"
                if stat[1] >= 100:
                    result.append({'ip_address': hostname, 'connection_count': stat[1]})
            return result
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_most_connected_days(self):
        query = """
        SELECT hostname, EXTRACT(DOW FROM timestamp) AS day_of_week, COUNT(*) AS connection_count
        FROM network_devices
        WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
        GROUP BY hostname, day_of_week
        ORDER BY hostname, day_of_week;
        """
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_conf)
            cur = conn.cursor()
            cur.execute(query)
            stats = cur.fetchall()
            total_counts = {}
            for stat in stats:
                hostname = (stat[0] or '')[:-10] or "Fritzbox-Modem"
                total_counts[hostname] = total_counts.get(hostname, 0) + stat[2]
            top_devices = sorted(total_counts.items(), key=lambda item: item[1], reverse=True)[:10]
            result = {hostname: [0]*7 for hostname,_ in top_devices}
            for stat in stats:
                hostname = (stat[0] or '')[:-10] or "Fritzbox-Modem"
                day = int(stat[1]); count = stat[2]
                if hostname in result:
                    result[hostname][day] += count
            return result
        finally:
            if cur: cur.close()
            if conn: conn.close()

class TrainService:
    def __init__(self, db_conf):
        self.db_conf = db_conf

    def fetch_and_save(self, train_destination):
        url = "https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2416&arrivals=False"
        scraper = TrainScraper(url, self.db_conf)
        trains = scraper.parse_trains(train_destination)
        scraper.save_trains_to_db(trains)
        # return train data from DB
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_conf)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            now = datetime.now()
            query_old = """
            SELECT train_number, destination, time, delay, platform, stops, timestamp
            FROM trains
            WHERE time < %s AND stops ILIKE %s
            ORDER BY time DESC LIMIT %s;
            """
            cur.execute(query_old, (now.time(), f'%{train_destination}%', 4))
            results_old = cur.fetchall()
            query_future = """
            SELECT train_number, destination, time, delay, platform, stops, timestamp
            FROM trains
            WHERE time > %s AND stops ILIKE %s
            ORDER BY time ASC LIMIT %s;
            """
            cur.execute(query_future, (now.time(), f'%{train_destination}%', 4))
            results = cur.fetchall()
            def serialize_row(row):
                return {
                    "train_number": row[0],
                    "destination": row[1],
                    "time": row[2].strftime('%H:%M'),
                    "delay": row[3],
                    "platform": row[4],
                    "stops": row[5],
                    "timestamp": row[6].isoformat()
                }
            return {"result": [serialize_row(r) for r in results], "result_old": [serialize_row(r) for r in results_old]}
        finally:
            if cur: cur.close()
            if conn: conn.close()

class TodolistService:
    def __init__(self, mongo_uri, db_name='local', collection='lista_spesa'):
        self.mongo = MongoDBHandler(mongo_uri, db_name, collection)

    def insert_item(self, item_name, quantity, store, timestamp):
        return self.mongo.add_shopping_item(item_name, quantity, store, timestamp)

    def read_today(self):
        return self.mongo.read_today_items()

    def delete_item(self, item_id):
        return self.mongo.delete_item(item_id)

    def range_timestamp(self, start_ts, end_ts):
        return self.mongo.range_timestamp(start_ts, end_ts)

class SSHService:
    @staticmethod
    def exec_command(private_key_str, command, passphrase=None):
        key_file = StringIO(private_key_str)
        private_key = None
        for key_class in [paramiko.ECDSAKey, paramiko.RSAKey, paramiko.Ed25519Key, paramiko.DSSKey]:
            try:
                key_file.seek(0)
                private_key = key_class.from_private_key(key_file, password=passphrase)
                break
            except paramiko.PasswordRequiredException:
                raise ValueError("Chiave richiede passphrase")
            except paramiko.SSHException:
                continue
        if private_key is None:
            raise ValueError("Chiave non supportata o corrotta")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        HOST_PI = os.getenv('HOST_PI'); PORT_PI = int(os.getenv('PORT_PI') or 22); USERNAME_PI = os.getenv('USERNAME_PI')
        client.connect(hostname=HOST_PI, port=PORT_PI, username=USERNAME_PI, pkey=private_key)
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        client.close()
        return out if out else err

# ---------------------
# Instantiate services
# ---------------------
sensor_service = SensorService(db_config)
air_quality_service = AirQualityService(db_config)
network_service = NetworkService(db_config)
train_service = TrainService(db_config)
todolist_service = TodolistService(URI)
ssh_service = SSHService()

# ---------------------
# Routes
# ---------------------
@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'favicon.ico')

@app.route('/')
def index():
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()
    labels = [f"{int(entry['hour'])}:00" for entry in data] if data else []
    temperatures = [entry['avg_temperature'] for entry in data] if data else []
    labels.reverse(); temperatures.reverse()
    last_temperature = last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A'
    last_humidity = last_entry.get('humidity', 'N/A') if last_entry else 'N/A'
    return render_template('index.html', labels=labels, temperatures=temperatures, last_temperature=last_temperature, last_humidity=last_humidity)

# Devices / network
@app.route('/api/devices', methods=['GET'])
@handle_db_error
def api_get_devices():
    conn = psycopg2.connect(**db_config)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        cur.execute("""SELECT * FROM network_devices WHERE timestamp = (SELECT MAX(timestamp) FROM network_devices) ORDER BY timestamp DESC;""")
        devices = cur.fetchall()
        devices_list = []
        for device in devices:
            hostname_trim = (device['hostname'] or '')[:-10]
            if hostname_trim == "":
                hostname_trim = "Fritzbox-modem1234567890"
            devices_list.append({
                'id': device['id'],
                'ip_address': device['ip_address'],
                'hostname': hostname_trim,
                'status': device['status'],
                'last_seen': device['timestamp'].isoformat()[:-7]
            })
        return jsonify(devices_list)
    finally:
        cur.close(); conn.close()

@app.route('/api/devices/stats', methods=['GET'])
@handle_db_error
def api_device_stats():
    return jsonify(network_service.get_device_stats()), 200

@app.route('/api/devices/most_connected_days', methods=['GET'])
@handle_db_error
def api_most_connected_days():
    return jsonify(network_service.get_most_connected_days()), 200

# Sensor APIs
@app.route('/api_sensors')
@handle_db_error
def api_sensors():
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()
    if not data:
        return jsonify({'error': 'Nessun dato disponibile.'}), 404
    try:
        min_temp = min(e['avg_temperature'] for e in data)
        max_temp = max(e['avg_temperature'] for e in data)
        hums = [e['humidity'] for e in data if e.get('humidity') is not None]
        min_hum = min(hums) if hums else None
        max_hum = max(hums) if hums else None
        avg_hum = (sum(hums)/len(hums)) if hums else None
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
                'minMaxLast24Hours': [f"{min_hum:.2f}" if min_hum is not None else "N/A", f"{max_hum:.2f}" if max_hum is not None else "N/A"],
                'average': f"{avg_hum:.2f}" if avg_hum is not None else "N/A",
                'chartData': chart_hum
            },
            'labels': [f"{int(entry['hour'])}:00" for entry in data]
        })
    except KeyError as e:
        return jsonify({'error': f'Chiave mancante: {e}'}), 500

@app.route('/api/today_temperature', methods=['GET'])
@handle_db_error
def api_today_temperature():
    return jsonify(sensor_service.get_today_hourly_temperature())

@app.route('/api/today_humidity', methods=['GET'])
@handle_db_error
def api_today_humidity():
    return jsonify(sensor_service.get_today_hourly_humidity())

@app.route('/api/monthly_temperature')
@handle_db_error
def api_monthly_temperature():
    return jsonify(sensor_service.get_monthly_temperature_data())

@app.route('/api/monthly_average_temperature')
@handle_db_error
def api_monthly_avg_temp_default():
    return jsonify(sensor_service.get_monthly_average_temperature())

@app.route('/api/monthly_average_temperature/<int:anno>', methods=['GET'])
@handle_db_error
def api_monthly_avg_temp_by_year(anno):
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400
    return jsonify(sensor_service.get_monthly_average_temperature(anno))

@app.route('/api/daily_temperature/<int:month>/', methods=['GET'])
@handle_db_error
def api_daily_temp(month):
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido.'}), 400
    data = sensor_service.get_daily_for_month(month)
    if not data:
        return jsonify({'error': 'Nessun dato per il mese.'}), 404
    return jsonify(data)

@app.route('/api/monthly_average_temperature/<int:mese>/<int:anno>', methods=['GET'])
@handle_db_error
def api_daily_temp_by_month_year(mese, anno):
    if mese < 1 or mese > 12: return jsonify({'error': 'Mese non valido.'}), 400
    if anno < 1900 or anno > datetime.now().year: return jsonify({'error': 'Anno non valido.'}), 400
    data = sensor_service.get_daily_for_month(mese, anno)
    if not data: return jsonify({'error': 'Nessun dato.'}), 404
    return jsonify(data)

@app.route('/api/temperature_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_temperature_average(start_datetime, end_datetime):
    try:
        s = datetime.fromisoformat(start_datetime); e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Formato data non valido. Usa ISO8601'}), 400
    data = sensor_service.get_average_temperatures(s, e)
    if data is None: return jsonify({'error': 'Errore fetching'}), 500
    return jsonify(data), 200

@app.route('/api/humidity_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_humidity_average(start_datetime, end_datetime):
    try:
        s = datetime.fromisoformat(start_datetime); e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Formato data non valido. Usa ISO8601'}), 400
    data = sensor_service.get_average_humidity(s, e)
    if data is None: return jsonify({'error': 'Errore fetching'}), 500
    return jsonify(data), 200

# Air quality
@app.route('/api/air_quality', methods=['GET', 'POST'])
@handle_db_error
def api_air_quality():
    if request.method == 'GET':
        limit = min(int(request.args.get('limit', 1000)), 5000)
        hours_back = min(int(request.args.get('hours', 24)), 168)
        conn = get_db_connection(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
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
                return jsonify({'error': 'No data found', 'message': f'Nessun dato nelle ultime {hours_back} ore.', 'count': 0}), 404
            out = []
            for r in rows:
                d = dict(r)
                d['smoke'] = float(d['smoke']); d['lpg'] = float(d['lpg']); d['methane'] = float(d['methane'])
                d['hydrogen'] = float(d['hydrogen']); d['air_quality_index'] = float(d['air_quality_index'])
                d['timestamp'] = d['timestamp'].isoformat()
                d['data_age_seconds'] = int(d['seconds_ago'])
                out.append(d)
            return jsonify({'data': out, 'count': len(out), 'hours_requested': hours_back, 'limit_applied': limit}), 200
        finally:
            cur.close(); conn.close()
    else:
        if not request.is_json:
            return jsonify({'error': 'Content-Type deve essere application/json'}), 400
        payload = request.get_json()
        try:
            insert_res = air_quality_service.insert_record(payload)
            return jsonify({'message': 'Dati salvati', 'id': insert_res['id'], 'timestamp': insert_res['timestamp'], 'data': payload}), 201
        except ValueError as e:
            return jsonify({'error': 'Validazione fallita', 'message': str(e)}), 400

@app.route('/api/last_air_quality_today', methods=['GET'])
@handle_db_error
def api_last_air_quality_today():
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
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
            return jsonify({'error': 'No data found', 'message': 'Nessun dato per oggi'}), 404
        res = dict(r)
        res['smoke'] = float(res['smoke']); res['lpg'] = float(res['lpg']); res['methane'] = float(res['methane'])
        res['hydrogen'] = float(res['hydrogen']); res['air_quality_index'] = float(res['air_quality_index'])
        res['timestamp'] = res['timestamp'].isoformat()
        return jsonify(res), 200
    finally:
        cur.close(); conn.close()

@app.route('/api/air_quality_today', methods=['GET'])
@handle_db_error
def api_air_quality_today_simplified():
    data = air_quality_service.get_daily_aggregated()
    if not data:
        return jsonify({'error': 'No data', 'message': 'Nessun dato per oggi'}), 404
    simplified = {str(hour): values['avg_air_quality_index'] for hour, values in data.items()}
    return jsonify(simplified), 200

@app.route('/api/gas_concentration_today', methods=['GET'])
@handle_db_error
def api_gas_concentration_today():
    global last_aggregation_time
    try:
        current_time = datetime.now()
        if last_aggregation_time is None or (current_time - last_aggregation_time) >= timedelta(hours=1):
            try:
                db.create_temp_table_and_aggregate_air_quality()
                # update last_aggregation_time only if no exception
                globals()['last_aggregation_time'] = current_time
            except Exception as e:
                logger.error(f"Aggregation error: {e}")
        data = air_quality_service.get_hourly_gas_concentration()
        if not data: return jsonify({'error': 'Nessun dato disponibile'}), 404
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error gas_concentration_today: {e}")
        return jsonify({'error': f'Errore interno: {str(e)}'}), 500

last_aggregation_time = None

# Raspi stats
@app.route('/api_raspberry_pi_stats')
@handle_db_error
def api_raspi_stats():
    try:
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp_str = f.read().strip()
                temperature = float(temp_str) / 1000.0
        except FileNotFoundError:
            temperature = None
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        stats = {
            'temperature': temperature,
            'cpuUsage': cpu_usage,
            'memoryUsed': f'{memory.used / (1024**3):.2f} GB',
            'memoryTotal': f'{memory.total / (1024**3):.2f} GB',
            'diskUsed': f'{disk.used / (1024**3):.2f} GB',
            'diskTotal': f'{disk.total / (1024**3):.2f} GB',
            'diskFree': f'{disk.free / (1024**3):.2f} GB'
        }
        return jsonify(stats)
    except FileNotFoundError:
        return jsonify({'error': 'File temperatura non trovato.'}), 404

# Trains
@app.route('/trains_data/<train_destination>', methods=['GET'])
@handle_db_error
def api_trains_data_fetch(train_destination):
    res = train_service.fetch_and_save(train_destination)
    return jsonify(res)

@app.route('/trains_data/<destination>', methods=['GET'])
@handle_db_error
def api_trains_data(destination):
    # wrapper to same function (kept for backward compatibility)
    res = train_service.fetch_and_save(destination)
    return jsonify(res)

# Security alarm
@app.route('/security/alarm', methods=['GET', 'POST'])
@handle_db_error
def alarm_status():
    conn = None; cur = None
    try:
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        if request.method == 'GET':
            cur.execute("SELECT status, timestamp FROM alarms_status ORDER BY timestamp DESC LIMIT 1;")
            r = cur.fetchone()
            return jsonify(r) if r else jsonify({'status': False, 'timestamp': None})
        else:
            data = request.get_json()
            if 'status' not in data:
                return jsonify({'error': 'Campo status mancante'}), 400
            status = data['status']
            cur.execute("DELETE FROM alarms_status;")
            cur.execute("INSERT INTO alarms_status (status) VALUES (%s);", (status,))
            conn.commit()
            return jsonify({'message': "Stato aggiornato"}), 201
    finally:
        if cur: cur.close(); 
        if conn: conn.close()

@app.route('/last_temp', methods=['GET'])
def last_temp():
    try:
        return db.last_temp_db()
    except Exception as e:
        logger.error(f"last_temp error: {e}")
        return jsonify({'error': 'Errore'}), 500

# Todolist (Mongo)
@app.route('/todolist/insert', methods=['POST'])
def todolist_insert():
    documents = request.json
    todolist_service.insert_item(documents['item_name'], documents['quantity'], documents['store'], documents['timestamp'])
    return jsonify({"message": "Inserted"}), 201

@app.route('/todolist/today', methods=['GET'])
def todolist_today():
    docs = todolist_service.read_today()
    return jsonify(docs), 200

@app.route('/lista-spesa', methods=['GET'])
def lista_spesa_page():
    return render_template("index-lista.html"), 200

@app.route('/todolist/delete/<item_id>', methods=['DELETE'])
def todolist_delete(item_id):
    if not ObjectId.is_valid(item_id):
        return jsonify({"message": "Invalid item ID"}), 400
    res = todolist_service.delete_item(item_id)
    if res.get("deleted_count", 0) > 0:
        return jsonify(res), 200
    return jsonify(res), 404

@app.route('/todolist/update/<start_timestamp>/<end_timestamp>', methods=['GET'])
def todolist_search_by_timestamp(start_timestamp, end_timestamp):
    try:
        docs = todolist_service.range_timestamp(start_timestamp, end_timestamp)
        if not docs:
            return jsonify({"message": "Nessun elemento trovato."}), 404
        return jsonify(docs), 200
    except Exception as e:
        return jsonify({"message": f"Error: {e}"}), 500

# Backup
@app.route('/api_run_backup', methods=['POST'])
@handle_db_error
def api_run_backup():
    try:
        backup_script_path = '/usr/local/bin/backup.sh'
        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Backup script not found.'}), 404
        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        logger.info(f"Backup stdout: {result.stdout}")
        logger.info(f"Backup stderr: {result.stderr}")
        if result.returncode == 0:
            invia_backup_email(email_sender)
            return jsonify({'message': 'Backup eseguito', 'output': result.stdout}), 200
        return jsonify({'error': 'Errore backup', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# SSH exec
@app.route('/api/ssh_exec', methods=['POST'])
@handle_db_error
def api_ssh_exec():
    data = request.get_json()
    private_key = data.get('privateKey'); command = data.get('command'); passphrase = data.get('passphrase') or None
    if not private_key or not command:
        return jsonify({"error": "Chiave privata o comando mancante"}), 400
    try:
        out = ssh_service.exec_command(private_key, command, passphrase)
        return jsonify({"output": out})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

# Expenses (Google Sheet)
@app.route('/api/expenses', methods=['POST', 'GET'])
@handle_db_error
def api_expenses():
    if request.method == 'POST':
        try:
            data = request.get_json()
            description = data.get('description')
            date = data.get('date')
            amount = data.get('amount')
            category = data.get('category')
            if not all([description, date, amount, category]):
                return jsonify({"error": "Missing fields"}), 400
            manager.add_expense(description, date, amount, category)
            return jsonify({"message": "Expense added"}), 201
        except ValueError as e:
            return jsonify({"error": str(e)}), 404
    else:
        try:
            summary = manager.get_summary_expenses()
            return jsonify(summary), 200
        except ValueError as e:
            return jsonify({"error": str(e)}), 404

@app.route('/api/p48', methods=['GET'])
@handle_db_error
def api_p48():
    try:
        fetcher = SheetValueFetcher(credentials_path=credentials_path, sheet_name="My NW", redis_host=os.getenv("REDIS_HOST", "redis"), redis_port=int(os.getenv("REDIS_PORT", 6379)))
        cached = fetcher.get_cached_value()
        try:
            live_value = fetcher.get_cell_value_p48()
            live_value = float(live_value.replace(",", "."))
        except Exception:
            live_value = None
        response = {"cached_value": float(cached.replace(",", ".")) if cached else None, "P48_value": live_value}
        return jsonify(response), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Misc pages
@app.route('/expenses')
def page_expenses():
    return render_template('expenses.html')

@app.route('/temp')
def page_temp():
    return render_template('temperature.html')

@app.route('/umid')
def page_umid():
    return render_template('umid.html')

@app.route('/train')
def page_train():
    return render_template('train.html')

@app.route('/air_quality')
def page_air_quality():
    return render_template('air_quality.html')

@app.route('/raspi')
def page_raspi():
    return render_template('raspi.html')

@app.route('/security')
def page_security():
    return render_template('security.html')

# Trains backup route (original behavior preserved)
@app.route('/trains_data/<train_destination>', methods=['GET'])
def trains_data_legacy(train_destination):
    return api_trains_data_fetch(train_destination)

# ---------------------
# Main
# ---------------------
if __name__ == '__main__':
    app.run(host=os.getenv('HOST', '0.0.0.0'), port=int(os.getenv('PORT', 5000)), debug=os.getenv('DEBUG', 'False').lower() == 'true')
