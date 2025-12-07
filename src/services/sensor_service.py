import psycopg2
import psycopg2.extras
from datetime import datetime
from models.database import BaseService
import logging
from client.PostgresClient import PostgresHandler
from config.settings import get_config

config = get_config()  # senza argomenti
db_config = config['DB_CONFIG']  # estrai la sezione DB_CONFIG

logger = logging.getLogger(__name__)

class SensorService(BaseService):
    """Service to manage temperature and humidity sensor data"""
    def __init__(self, db_config):
        self.db_config = db_config
        self.db = PostgresHandler(db_config)

    def get_hourly_today(self):
        """Gets hourly data for today"""
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
        return self._execute_query(query)

    def get_latest(self):
        """Gets the latest sensor reading"""
        query = "SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
        return self._execute_query(query, fetch_one=True, fetch_all=False)

    def get_monthly_temperature_data(self, year=None):
        """Gets monthly temperature data for a year"""
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
        rows = self._execute_query(query, (year,))
        monthly = {}
        for row in rows:
            m = int(row['month'])
            d = int(row['day'])
            t = float(row['avg_temperature'])
            monthly.setdefault(m, {})[d] = t
        return monthly

    def get_monthly_average_temperature(self, year=None):
        """Gets average monthly temperature for a year"""
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
        rows = self._execute_query(query, (year,))
        return {int(r['month']): float(r['avg_temperature']) for r in rows}

    def get_daily_for_month(self, month, year=None):
        """Gets daily data for a specific month"""
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
        rows = self._execute_query(query, (month, year))
        return {int(r['day']): float(r['avg_temperature']) for r in rows}

    def get_today_hourly_temperature(self):
        """Gets hourly temperature data for today"""
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """
        rows = self._execute_query(query)
        return {int(r['hour']): float(r['avg_temperature']) for r in rows}

    def get_today_hourly_humidity(self):
        """Gets hourly humidity data for today"""
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """
        rows = self._execute_query(query)
        return {int(r['hour']): float(r['avg_humidity']) for r in rows}

    def get_average_temperatures(self, start_dt, end_dt):
        """Gets average temperatures in a date range"""
        query = """
            SELECT DATE_TRUNC('hour', timestamp) AS hour, 
                   ROUND(AVG(temperature_c)::numeric, 2) AS avg_temp
            FROM sensor_readings
            WHERE timestamp BETWEEN %s AND %s
            GROUP BY hour
            ORDER BY hour;
        """
        rows = self._execute_query(query, (start_dt, end_dt))
        return [{"hour": r['hour'].isoformat(), "avg_temperature": float(r['avg_temp'])} for r in rows]

    def get_average_humidity(self, start_dt, end_dt):
        """Gets average humidity in a date range"""
        query = """
            SELECT DATE_TRUNC('hour', timestamp) AS hour, 
                   ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
            FROM sensor_readings
            WHERE timestamp BETWEEN %s AND %s
            GROUP BY hour
            ORDER BY hour;
        """
        rows = self._execute_query(query, (start_dt, end_dt))
        return [{"hour": r['hour'].isoformat(), "avg_humidity": float(r['avg_humidity'])} for r in rows]

    def get_last_temperature(self):
        """Gets the last recorded temperature"""
        query = "SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
        r = self._execute_query(query, fetch_one=True, fetch_all=False)
        if r:
            return {
                'temperature_c': float(r['temperature_c']),
                'humidity': float(r['humidity']) if r['humidity'] else None,
                'timestamp': r['timestamp'].isoformat()
            }
        return None

    def get_daily_humidity_for_month(self, month, year=None):
        """Gets daily humidity data for a specific month"""
        if year is None:
            year = datetime.now().year
        query = """
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
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
            return {int(r['day']): float(r['avg_humidity']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()

    def get_monthly_average_humidity(self, year):
        """Gets average monthly humidity for a year"""
        query = """
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
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
            return {int(r['month']): float(r['avg_humidity']) for r in rows}
        finally:
            if cur: cur.close()
            if conn: conn.close()


    def set_target_temperature(self, value):
        try:
            return self.db.set_target_temperature(value)
        except Exception as e:
            logger.error(f"Errore set_target_temperature: {e}")
            return False
        
    def get_target_temperature(self):
        try:
            return self.db.get_target_temperature()
        except Exception as e:
            logger.error(f"Errore get_target_temperature: {e}")
            return None

    def set_thermostat_enabled(self, enabled: bool):
        """Aggiorna lo stato del termostato nel DB"""
        try:
            query = """
            INSERT INTO thermostat_status (enabled, updated_at)
            VALUES (%s, NOW())
            ON CONFLICT (id) DO UPDATE
            SET enabled = EXCLUDED.enabled,
                updated_at = NOW();
            """
            return self.db.execute_query(query, (enabled,), fetch=False) is not None
        except Exception as e:
            logger.error(f"Errore set_thermostat_enabled: {e}")
            return False

    def get_thermostat_enabled(self):
        """Recupera lo stato corrente del termostato"""
        try:
            query = "SELECT enabled FROM thermostat_status ORDER BY updated_at DESC LIMIT 1;"
            rows = self.db.execute_query(query, fetch=True)
            if rows:
                return rows[0][0]
            return False
        except Exception as e:
            logger.error(f"Errore get_thermostat_enabled: {e}")
            return False

        # Legge stato caldaia
    def get_boiler_status(self):
        row = self.db.execute_query("SELECT is_on FROM boiler_status ORDER BY id DESC LIMIT 1;")
        return row['is_on'] if row else False

    # Aggiorna stato caldaia
    def set_boiler_status(self, is_on: bool):
        try:
            self.db.execute_query(
                "INSERT INTO boiler_status (is_on, updated_at) VALUES (%s, NOW())",
                (is_on,)
            )
            return True
        except Exception as e:
            print("DB error set_boiler_status:", e)
            return False

