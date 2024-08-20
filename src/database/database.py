import mysql.connector
from mysql.connector import Error
from datetime import datetime

class Database:
    def __init__(self, db_config):
        """Inizializza la connessione al database MySQL e crea la tabella se non esiste."""
        self.db_config = db_config
        self.connection = None
        self.cursor = None
        self.connect_to_db()
        self.create_table_if_not_exists()
    
    def connect_to_db(self):
        """Crea una connessione al database MySQL."""
        try:
            self.connection = mysql.connector.connect(**self.db_config)
            self.cursor = self.connection.cursor()
        except Error as e:
            print(f"Errore nella connessione al database: {e}")
            exit(1)
    
    def create_table_if_not_exists(self):
        """Crea la tabella se non esiste già."""
        try:
            create_table_query = """
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                temperature_c FLOAT NOT NULL,
                humidity FLOAT NOT NULL,
                timestamp DATETIME NOT NULL
            );
            """
            self.cursor.execute(create_table_query)
            self.connection.commit()
        except Error as e:
            print(f"Errore durante la creazione della tabella: {e}")
            exit(1)
    

    def save_to_db(self, temperature, humidity):
        """Salva i dati nel database."""
        try:
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            query = "INSERT INTO sensor_readings (temperature_c, humidity, timestamp) VALUES (%s, %s, %s)"
            values = (temperature, humidity, current_time)
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


