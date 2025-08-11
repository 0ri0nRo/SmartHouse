import psycopg2
import psycopg2.extras
from datetime import datetime
from models.database import BaseService

class SensorService(BaseService):
    """Servizio per gestire i dati dei sensori di temperatura e umidità"""
    
    def get_hourly_today(self):
        """Ottiene i dati orari di oggi"""
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
        """Ottiene l'ultima lettura del sensore"""
        query = "SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
        return self._execute_query(query, fetch_one=True, fetch_all=False)

    def get_monthly_temperature_data(self, year=None):
        """Ottiene i dati mensili di temperatura per un anno"""
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
        """Ottiene la temperatura media mensile per un anno"""
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
        """Ottiene i dati giornalieri per un mese specifico"""
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
        """Ottiene i dati orari di temperatura per oggi"""
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
        """Ottiene i dati orari di umidità per oggi"""
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
        """Ottiene le temperature medie in un range di date"""
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
        """Ottiene l'umidità media in un range di date"""
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
        """Ottiene l'ultima temperatura registrata"""
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
