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
            print("Dati inseriti nel database.")
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
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45) NOT NULL,
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
            query = """
            INSERT INTO network_devices (ip_address, hostname, status, timestamp) 
            VALUES (%s, %s, %s, %s)
            """
            timestamp = datetime.now()  # Ottieni il timestamp corrente
            for ip, info in devices.items():
                values = (ip, info['hostname'], info['status'], timestamp)
                self.cursor.execute(query, values)
            self.connection.commit()
            print("Dispositivi di rete inseriti nel database.")
        except Error as e:
            print(f"Errore durante l'inserimento dei dati: {e}")
    
    
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