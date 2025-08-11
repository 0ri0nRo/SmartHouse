import psycopg2
import psycopg2.extras
from datetime import datetime
from models.database import BaseService

class AirQualityService(BaseService):
    """Servizio per gestire i dati della qualità dell'aria"""
    
    def get_latest(self):
        """Ottiene l'ultima lettura della qualità dell'aria"""
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
            if cur:
                cur.close()
            if conn:
                conn.close()

    def insert_record(self, payload: dict):
        """Inserisce un nuovo record di qualità dell'aria"""
        required_fields = ['smoke', 'lpg', 'methane', 'hydrogen', 'air_quality_index', 'air_quality_description']
        for f in required_fields:
            if f not in payload:
                raise ValueError(f"Missing field: {f}")

        # Validation
        smoke = float(payload['smoke'])
        lpg = float(payload['lpg'])
        methane = float(payload['methane'])
        hydrogen = float(payload['hydrogen'])
        aqi = float(payload['air_quality_index'])
        desc = str(payload['air_quality_description']).strip()
        
        if not (0 <= smoke <= 1000):
            raise ValueError("smoke out of range")
        if not (0 <= lpg <= 1000):
            raise ValueError("lpg out of range")
        if not (0 <= methane <= 1000):
            raise ValueError("methane out of range")
        if not (0 <= hydrogen <= 1000):
            raise ValueError("hydrogen out of range")
        if not (0 <= aqi <= 500):
            raise ValueError("aqi out of range")
        if not desc:
            raise ValueError("desc empty")

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
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_daily_aggregated(self):
        """Ottiene i dati aggregati per oggi"""
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
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_hourly_gas_concentration(self):
        """Ottiene le concentrazioni di gas per ora"""
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
                # Return placeholder for 24h
                return {str(h): {
                    'avg_smoke': 0.0,
                    'avg_lpg': 0.0,
                    'avg_methane': 0.0,
                    'avg_hydrogen': 0.0,
                    'measurement_count': 0
                } for h in range(24)}
            
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
            if cur:
                cur.close()
            if conn:
                conn.close()