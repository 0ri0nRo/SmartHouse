import psycopg2
from psycopg2 import Error
from datetime import datetime

class Database:
    def __init__(self, db_config):
        """Inizializza la connessione al database PostgreSQL e crea la tabella se non esiste."""
        self.db_config = db_config
        self.connection = None
        self.cursor = None
        self.connect_to_db()
        self.create_table_if_not_exists()
    
    def connect_to_db(self):
        """Crea una connessione al database PostgreSQL."""
        try:
            self.connection = psycopg2.connect(**self.db_config)
            self.cursor = self.connection.cursor()
        except Error as e:
            print(f"Errore nella connessione al database: {e}")
            exit(1)
    
    def create_table_if_not_exists(self):
        """Crea la tabella se non esiste già."""
        try:
            create_table_query = """
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id SERIAL PRIMARY KEY,
                temperature_c FLOAT NOT NULL,
                humidity FLOAT NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );
            """
            self.cursor.execute(create_table_query)
            self.connection.commit()
        except Error as e:
            print(f"Errore durante la creazione della tabella: {e}")
            exit(1)
    
    def save_to_db(self, temperature, humidity):
        """Salva i dati nel database. Se è mezzanotte, cancella tutte le righe prima dell'inserimento."""
        try:
            now = datetime.now()
            # timestamp = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            # Controlla se l'orario corrente è mezzanotte
            # if now.hour == 0 and now.minute == 0:
            #    print("È mezzanotte. Cancellazione di tutte le righe dalla tabella.")
            #    self.cursor.execute("DELETE FROM sensor_readings")
            #    self.connection.commit()
            
            # Inserisci i nuovi dati
            query = """
            INSERT INTO sensor_readings (temperature_c, humidity, timestamp) 
            VALUES (%s, %s, %s)
            """
            values = (temperature, humidity, now)
            self.cursor.execute(query, values)
            self.connection.commit()
        except Error as e:
            print(f"Errore durante l'inserimento dei dati: {e}")

    def close(self):
        """Chiude la connessione al database e il cursore."""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()
        print("Connessione al database chiusa.")
    
    def create_table_if_not_exists_devices(self):
        """Crea la tabella se non esiste già."""
        try:
            create_table_query = """
            CREATE TABLE IF NOT EXISTS network_devices (
                ip_address VARCHAR(45) NOT NULL PRIMARY KEY,
                hostname VARCHAR(255),
                status VARCHAR(50),
                timestamp TIMESTAMP NOT NULL
            );
            """
            self.cursor.execute(create_table_query)
            self.connection.commit()
        except Error as e:
            print(f"Errore durante la creazione della tabella: {e}")
            exit(1)
    
    def save_devices_to_db(self, devices):
        """Salva le informazioni sui dispositivi di rete nel database."""
        try:
            # Query per inserire o aggiornare il dispositivo a seconda della lunghezza dell'hostname
            query_insert_or_update = """
            INSERT INTO network_devices (ip_address, hostname, status, timestamp)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (ip_address) 
            DO UPDATE SET 
                hostname = CASE 
                            WHEN LENGTH(EXCLUDED.hostname) > LENGTH(network_devices.hostname) 
                            THEN EXCLUDED.hostname 
                            ELSE network_devices.hostname 
                        END,
                status = EXCLUDED.status,
                timestamp = EXCLUDED.timestamp;
            """
            timestamp = datetime.now()  # Ottieni il timestamp corrente

            # Itera sui dispositivi per inserirli o aggiornarli in base alla lunghezza dell'hostname
            for ip, info in devices.items():
                values = (ip, info['hostname'], info['status'], timestamp)
                self.cursor.execute(query_insert_or_update, values)

            # Commit delle modifiche nel database
            self.connection.commit()
            print("Dispositivi di rete inseriti o aggiornati nel database.")
        
        except Error as e:
            print(f"Errore durante l'inserimento o l'aggiornamento dei dati: {e}")

    
    def get_devices_from_db(self):
        """Recupera i dispositivi salvati più recentemente dal database."""
        try:
            query = """
            SELECT ip_address, hostname, status, timestamp 
            FROM network_devices 
            ORDER BY timestamp DESC;
            """
            self.cursor.execute(query)
            rows = self.cursor.fetchall()
            devices = {}
            for row in rows:
                ip_address, hostname, status, timestamp = row
                devices[ip_address] = {
                    'hostname': hostname,
                    'status': status,
                    'timestamp': timestamp
                }
            return devices
        except Error as e:
            print(f"Errore durante il recupero dei dispositivi: {e}")
            return {}

    def save_trains_to_db(self, trains):
        """Salva le informazioni sui treni nel database. Cancella i treni del giorno precedente."""
        try:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            # Cancella i treni del giorno precedente
            self.cursor.execute("DELETE FROM trains WHERE timestamp < %s", (today_start,))
            self.connection.commit()

            # Query per inserire o aggiornare i treni
            query = """
            INSERT INTO trains (train_number, destination, time, delay, platform, stops, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (train_number) DO UPDATE
            SET
                destination = EXCLUDED.destination,
                time = EXCLUDED.time,
                delay = EXCLUDED.delay,
                platform = EXCLUDED.platform,
                stops = EXCLUDED.stops,
                timestamp = EXCLUDED.timestamp;
            """
            for train_number, info in trains.items():
                values = (
                    train_number,
                    info['destinazione'],
                    info['orario'],
                    info['ritardo'],
                    info['binario'],
                    info['fermate'],
                    now
                )
                self.cursor.execute(query, values)

            self.connection.commit()
            print("Treni inseriti o aggiornati nel database.")
        
        except Error as e:
            print(f"Errore durante l'inserimento o l'aggiornamento dei dati dei treni: {e}")



    def create_table_if_not_exists_trains(self):
        """Crea la tabella per i treni se non esiste già."""
        try:
            create_table_query = """
            CREATE TABLE IF NOT EXISTS trains (
                train_number VARCHAR(20) NOT NULL PRIMARY KEY,
                destination VARCHAR(255),
                time TIME,
                delay VARCHAR(20),
                platform VARCHAR(20),
                stops TEXT,
                timestamp TIMESTAMP NOT NULL
            );
            """
            self.cursor.execute(create_table_query)
            self.connection.commit()
        except Error as e:
            print(f"Errore durante la creazione della tabella trains: {e}")
            exit(1)

    def save_alarm_status_to_db(self, status):
        """Salva uno stato booleano nel database."""
        try:
            query = """
            INSERT INTO alarms_status (status) 
            VALUES (%s)
            """
            self.cursor.execute(query, (status,))
            self.connection.commit()
            print("Stato dell'allarme inserito nel database.")
        except Error as e:
            print(f"Errore durante l'inserimento dello stato dell'allarme: {e}")

    def get_last_alarm_status(self):
        """Recupera l'ultimo stato booleano inserito nel database."""
        try:
            query = """
            SELECT status, timestamp 
            FROM alarms_status 
            ORDER BY timestamp DESC 
            LIMIT 1;
            """
            self.cursor.execute(query)
            result = self.cursor.fetchone()
            if result:
                status, timestamp = result
                return {'status': status, 'timestamp': timestamp}
            else:
                return None
        except Error as e:
            print(f"Errore durante il recupero dello stato dell'allarme: {e}")
            return None

    def last_temp_db(self):

        try:
            query = """
            SELECT temperature_c, timestamp
            FROM sensor_readings
            ORDER BY timestamp DESC
            LIMIT 1;
            """
            self.cursor.execute(query)
            result = self.cursor.fetchone()
            return {"last_entry" : result}

        except Error as e:
            print(f"Errore durante il recupero dell'ultima temperatura: {e}")
            return None
        
    def create_temp_table_and_aggregate_data(self):
        """Crea una tabella temporanea per le medie orarie, cancella i dati esistenti e aggiorna la tabella originale."""
        try:
            # Crea la tabella temporanea
            create_temp_table_query = """
            CREATE TEMP TABLE IF NOT EXISTS temp_sensor_averages (
                hour TIMESTAMP PRIMARY KEY,
                avg_temperature_c FLOAT NOT NULL,
                avg_humidity FLOAT NOT NULL
            );
            """
            self.cursor.execute(create_temp_table_query)

            # Calcola le medie per ciascuna ora e inseriscile nella tabella temporanea
            insert_averages_query = """
            INSERT INTO temp_sensor_averages (hour, avg_temperature_c, avg_humidity)
            SELECT
                date_trunc('hour', timestamp) AS hour,
                AVG(temperature_c) AS avg_temperature_c,
                AVG(humidity) AS avg_humidity
            FROM
                sensor_readings
            GROUP BY
                hour
            ORDER BY
                hour;
            """
            self.cursor.execute(insert_averages_query)

            # Cancella i dati esistenti dalla tabella originale
            delete_original_query = "DELETE FROM sensor_readings;"
            self.cursor.execute(delete_original_query)

            # Inserisci i dati aggregati dalla tabella temporanea nella tabella originale
            insert_into_original_query = """
            INSERT INTO sensor_readings (temperature_c, humidity, timestamp)
            SELECT 
                avg_temperature_c, 
                avg_humidity, 
                hour
            FROM 
                temp_sensor_averages;
            """
            self.cursor.execute(insert_into_original_query)


            # Cancella i dati esistenti dalla tabella temporanea
            delete_original_query = "DROP TABLE temp_sensor_averages;"
            self.cursor.execute(delete_original_query)

            # Commit per salvare tutte le operazioni
            self.connection.commit()

            print("Dati aggregati inseriti correttamente nella tabella originale.")
        
        except Error as e:
            print(f"Errore durante l'aggregazione dei dati: {e}")
            self.connection.rollback()  # Ripristina lo stato del database in caso di errore
    
    def create_table_if_not_exists_air_quality(self):
        """Crea la tabella per i dati di qualità dell'aria se non esiste già."""
        try:
            create_table_query = """
            CREATE TABLE IF NOT EXISTS air_quality (
                id SERIAL PRIMARY KEY,
                smoke FLOAT NOT NULL,
                lpg FLOAT NOT NULL,
                methane FLOAT NOT NULL,
                hydrogen FLOAT NOT NULL,
                air_quality_index FLOAT NOT NULL,
                air_quality_description TEXT NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );
            """
            self.cursor.execute(create_table_query)
            self.connection.commit()
            print("Tabella air_quality creata correttamente.")
        except Error as e:
            print(f"Errore durante la creazione della tabella air_quality: {e}")
            exit(1)


    def save_air_quality_to_db(self, smoke_value, lpg_value, methane_value, hydrogen_value, air_quality_index, air_quality_description):
        """Salva i dati di qualità dell'aria nel database."""
        try:
            timestamp = datetime.now()
            query = """
            INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            self.cursor.execute(query, (smoke_value, lpg_value, methane_value, hydrogen_value, air_quality_index, air_quality_description, timestamp))
            self.connection.commit()
            print("Dati di qualità dell'aria salvati nel database.")
        except Error as e:
            print(f"Errore durante l'inserimento dei dati di qualità dell'aria: {e}")

    def get_last_air_quality(self):
        """Recupera l'ultimo valore di qualità dell'aria dal database."""
        try:
            query = """
            SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp 
            FROM air_quality 
            ORDER BY timestamp DESC 
            LIMIT 1;
            """
            self.cursor.execute(query)
            result = self.cursor.fetchone()
            if result:
                smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp = result
                return {
                    'smoke': smoke,
                    'lpg': lpg,
                    'methane': methane,
                    'hydrogen': hydrogen,
                    'air_quality_index': air_quality_index,
                    'air_quality_description': air_quality_description,
                    'timestamp': timestamp
                }
            else:
                return None
        except Error as e:
            print(f"Errore durante il recupero del valore di qualità dell'aria: {e}")
            return None
    
    def create_temp_table_and_aggregate_air_quality(self):
        """Crea una tabella temporanea per le medie orarie e giornaliere, cancella i dati esistenti e aggiorna la tabella originale."""
        try:
            # Crea la tabella temporanea per le medie orarie
            create_temp_hourly_table_query = """
            CREATE TEMP TABLE IF NOT EXISTS temp_air_quality_hourly (
                hour TIMESTAMP PRIMARY KEY,
                avg_smoke FLOAT NOT NULL,
                avg_lpg FLOAT NOT NULL,
                avg_methane FLOAT NOT NULL,
                avg_hydrogen FLOAT NOT NULL,
                avg_air_quality_index FLOAT NOT NULL
            );
            """
            self.cursor.execute(create_temp_hourly_table_query)

            # Calcola le medie per ciascuna ora e inseriscile nella tabella temporanea oraria
            insert_hourly_averages_query = """
            INSERT INTO temp_air_quality_hourly (hour, avg_smoke, avg_lpg, avg_methane, avg_hydrogen, avg_air_quality_index)
            SELECT
                date_trunc('hour', timestamp) AS hour,
                AVG(smoke) AS avg_smoke,
                AVG(lpg) AS avg_lpg,
                AVG(methane) AS avg_methane,
                AVG(hydrogen) AS avg_hydrogen,
                AVG(air_quality_index) AS avg_air_quality_index
            FROM
                air_quality
            GROUP BY
                hour
            ORDER BY
                hour;
            """
            self.cursor.execute(insert_hourly_averages_query)

            # Cancella i dati esistenti dalla tabella originale
            delete_original_query = "DELETE FROM air_quality;"
            self.cursor.execute(delete_original_query)

            # Inserisci i dati aggregati dalla tabella temporanea oraria nella tabella originale
            insert_into_original_query = """
            INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, timestamp, air_quality_description)
            SELECT 
                avg_smoke, 
                avg_lpg, 
                avg_methane, 
                avg_hydrogen, 
                avg_air_quality_index, 
                hour, 
                'Aggregated Hourly Data'
            FROM 
                temp_air_quality_hourly;
            """
            self.cursor.execute(insert_into_original_query)

            # Cancella i dati esistenti dalla tabella temporanea oraria
            drop_temp_hourly_table_query = "DROP TABLE temp_air_quality_hourly;"
            self.cursor.execute(drop_temp_hourly_table_query)

            # Commit per salvare tutte le operazioni
            self.connection.commit()

            print("Dati aggregati per ora inseriti correttamente nella tabella originale.")
        
        except Error as e:
            print(f"Errore durante l'aggregazione dei dati: {e}")
            self.connection.rollback()  # Ripristina lo stato del database in caso di errore
