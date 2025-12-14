import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
from models.database import BaseService
import logging
from client.PostgresClient import PostgresHandler
from config.settings import get_config
import requests

config = get_config()  # senza argomenti
db_config = config['DB_CONFIG']  # estrai la sezione DB_CONFIG

logger = logging.getLogger(__name__)

class SensorService(BaseService):
    """Service to manage temperature and humidity sensor data"""
    def __init__(self, db_config):
        self.db_config = db_config
        self.db = PostgresHandler(db_config)
        self.SHELLY_IP = "192.168.178.165"
        self.TEMPERATURE_HYSTERESIS = 0.5  # Isteresi di 0.5°C per evitare oscillazioni


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

    def get_boiler_status(self) -> bool:
        try:
            row = self.db.execute_query(
                "SELECT is_on FROM boiler_status ORDER BY id DESC LIMIT 1;",
                fetch=True  # 🔥 AGGIUNGI QUESTO
            )
            if row and len(row) > 0:
                return bool(row[0][0])
            return False
        except Exception as e:
            print(f"❌ DB error get_boiler_status: {e}")
            return False


    def set_boiler_status(self, is_on: bool) -> bool:
        try:
            row = self.db.execute_query(
                "SELECT id FROM boiler_status ORDER BY id DESC LIMIT 1;",
                fetch=True  # 🔥 AGGIUNGI QUESTO
            )
            
            if row and len(row) > 0:
                last_id = row[0][0]
                self.db.execute_query(
                    "UPDATE boiler_status SET is_on = %s, updated_at = NOW() WHERE id = %s;",
                    (is_on, last_id)
                    # fetch=False è già il default per UPDATE
                )
            else:
                self.db.execute_query(
                    "INSERT INTO boiler_status (is_on, updated_at) VALUES (%s, NOW());",
                    (is_on,)
                )
            return True
        except Exception as e:
            print(f"❌ DB error set_boiler_status: {e}")
            return False
    

    def get_target_temperature(self):
        """Ottiene la temperatura target dal database."""
        return self.db.get_target_temperature()


    def set_target_temperature(self, value):
        """Imposta la temperatura target nel database."""
        success = self.db.set_target_temperature(value)
        if success:
            self.db.log_thermostat_action(
                action="TARGET_TEMP_CHANGED",
                target_temp=value
            )
        return success


    def get_thermostat_enabled(self):
        """Verifica se il termostato è abilitato."""
        return self.db.get_thermostat_status()


    def set_thermostat_enabled(self, enabled):
        """Abilita o disabilita il termostato."""
        success = self.db.set_thermostat_status(enabled)
        if success:
            self.db.log_thermostat_action(
                action="THERMOSTAT_ENABLED" if enabled else "THERMOSTAT_DISABLED"
            )
        return success


    def get_boiler_status(self):
        """Ottiene lo stato corrente della caldaia."""
        return self.db.get_boiler_status()


    def set_boiler_status(self, is_on):
        """Imposta lo stato della caldaia."""
        return self.db.set_boiler_status(is_on)


    def control_shelly_relay(self, turn_on):
        """Controlla il relay Shelly (accende/spegne la caldaia fisicamente)."""
        try:
            action = "on" if turn_on else "off"
            url = f"http://{self.SHELLY_IP}/relay/0?turn={action}"
            response = requests.get(url, timeout=3)
            
            if response.status_code == 200:
                return True
            else:
                logger.error(f"Errore Shelly: status code {response.status_code}")
                return False
                
        except requests.RequestException as e:
            logger.error(f"Errore comunicazione con Shelly: {e}")
            return False


    def get_shelly_status(self):
        """Ottiene lo stato corrente del relay Shelly."""
        try:
            url = f"http://{self.SHELLY_IP}/relay/0"
            response = requests.get(url, timeout=3)
            
            if response.status_code == 200:
                data = response.json()
                return data.get("ison", False)
            else:
                return None
                
        except requests.RequestException as e:
            logger.error(f"Errore lettura stato Shelly: {e}")
            return None


    def thermostat_control_logic(self):
        """
        Logica principale del termostato.
        Confronta temperatura corrente con target e controlla la caldaia.
        Usa isteresi per evitare oscillazioni continue.
        """
        try:
            # Verifica se il termostato è abilitato
            thermostat_enabled = self.get_thermostat_enabled()
            if not thermostat_enabled:
                logger.info("Termostato disabilitato, nessuna azione")
                return {
                    'action': 'none',
                    'reason': 'thermostat_disabled'
                }
            
            # Ottieni temperatura corrente e target
            current_temp = self.db.get_current_temperature()
            target_temp = self.get_target_temperature()
            
            if current_temp is None:
                logger.error("Impossibile leggere la temperatura corrente")
                return {
                    'action': 'error',
                    'reason': 'no_temperature_reading'
                }
            
            if target_temp is None:
                logger.error("Temperatura target non impostata")
                return {
                    'action': 'error',
                    'reason': 'no_target_temperature'
                }
            
            # Ottieni stato corrente della caldaia
            current_boiler_status = self.get_boiler_status()
            
            # Calcola la differenza di temperatura
            temp_diff = target_temp - current_temp
            
            logger.info(f"Termostato check - Corrente: {current_temp}°C, Target: {target_temp}°C, Diff: {temp_diff:.2f}°C")
            
            # Logica con isteresi
            action_taken = None
            
            if current_boiler_status:
                # Caldaia accesa: spegni se temperatura raggiunta (con isteresi)
                if temp_diff <= -self.TEMPERATURE_HYSTERESIS:
                    logger.info(f"Temperatura raggiunta ({current_temp}°C >= {target_temp}°C), spegnimento caldaia")
                    
                    # Spegni il relay Shelly
                    shelly_success = self.control_shelly_relay(False)
                    
                    if shelly_success:
                        # Aggiorna stato nel DB
                        self.set_boiler_status(False)
                        
                        # Log dell'azione
                        self.db.log_thermostat_action(
                            action="BOILER_TURNED_OFF",
                            current_temp=current_temp,
                            target_temp=target_temp,
                            boiler_status=False
                        )
                        
                        action_taken = 'turned_off'
                    else:
                        logger.error("Impossibile spegnere il relay Shelly")
                        action_taken = 'error_turning_off'
            else:
                # Caldaia spenta: accendi se temperatura troppo bassa (con isteresi)
                if temp_diff >= self.TEMPERATURE_HYSTERESIS:
                    logger.info(f"Temperatura bassa ({current_temp}°C < {target_temp}°C), accensione caldaia")
                    
                    # Accendi il relay Shelly
                    shelly_success = self.control_shelly_relay(True)
                    
                    if shelly_success:
                        # Aggiorna stato nel DB
                        self.set_boiler_status(True)
                        
                        # Log dell'azione
                        self.db.log_thermostat_action(
                            action="BOILER_TURNED_ON",
                            current_temp=current_temp,
                            target_temp=target_temp,
                            boiler_status=True
                        )
                        
                        action_taken = 'turned_on'
                    else:
                        logger.error("Impossibile accendere il relay Shelly")
                        action_taken = 'error_turning_on'
            
            if action_taken is None:
                action_taken = 'no_change'
                logger.info("Temperatura nel range di isteresi, nessuna azione necessaria")
            
            return {
                'action': action_taken,
                'current_temp': current_temp,
                'target_temp': target_temp,
                'temp_diff': temp_diff,
                'boiler_status': self.get_boiler_status()
            }
            
        except Exception as e:
            logger.error(f"Errore nella logica del termostato: {e}")
            return {
                'action': 'error',
                'reason': str(e)
            }


    def sync_boiler_with_shelly(self):
        """
        Sincronizza lo stato della caldaia nel DB con lo stato reale dello Shelly.
        Usa questa funzione per risolvere eventuali discrepanze.
        """
        try:
            # Leggi stato reale dallo Shelly
            shelly_status = self.get_shelly_status()
            
            if shelly_status is None:
                logger.warning("Impossibile leggere stato Shelly per sincronizzazione")
                return False
            
            # Leggi stato dal DB
            db_status = self.get_boiler_status()
            
            # Se c'è discrepanza, aggiorna il DB
            if shelly_status != db_status:
                logger.warning(f"Discrepanza rilevata! DB: {db_status}, Shelly: {shelly_status}")
                logger.info(f"Aggiornamento DB con stato Shelly: {shelly_status}")
                
                self.set_boiler_status(shelly_status)
                
                self.db.log_thermostat_action(
                    action="SYNC_DB_WITH_SHELLY",
                    boiler_status=shelly_status
                )
                
                return True
            
            return True
            
        except Exception as e:
            logger.error(f"Errore durante la sincronizzazione: {e}")
            return False


    def get_thermostat_status_full(self):
        """Ottiene lo stato completo del termostato per il frontend."""
        try:
            current_temp = self.db.get_current_temperature()
            target_temp = self.get_target_temperature()
            thermostat_enabled = self.get_thermostat_enabled()
            boiler_on = self.get_boiler_status()
            
            status = {
                'current_temperature': current_temp,
                'target_temperature': target_temp,
                'thermostat_enabled': thermostat_enabled,
                'boiler_on': boiler_on,
                'temp_diff': None,
                'status_text': 'Unknown'
            }
            
            if current_temp is not None and target_temp is not None:
                status['temp_diff'] = target_temp - current_temp
                
                if not thermostat_enabled:
                    status['status_text'] = 'Thermostat disabled'
                elif status['temp_diff'] > self.TEMPERATURE_HYSTERESIS:
                    status['status_text'] = 'Heating needed'
                elif status['temp_diff'] < -self.TEMPERATURE_HYSTERESIS:
                    status['status_text'] = 'Temperature above target'
                else:
                    status['status_text'] = 'Target temperature reached'
            
            return status
            
        except Exception as e:
            logger.error(f"Errore get_thermostat_status_full: {e}")
            return None
