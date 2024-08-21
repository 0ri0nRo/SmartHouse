import serial
import json
import re
import time
import psycopg2
from database.database import Database

# Definizione delle variabili di connessione al database
db_host = 'db'  # Modifica se necessario
db_database = 'sensor_data'
db_user = 'postgres'
db_password = '1234'

# Connessione al database
def get_db_connection():
    """Crea e ritorna una connessione al database."""
    return psycopg2.connect(
        dbname=db_database,
        user=db_user,
        password=db_password,
        host=db_host
    )

class SensorReader:
    def __init__(self, port, baud_rate, timeout):
        """Inizializza la connessione seriale e la connessione al database."""
        self.ser = serial.Serial(port, baud_rate, timeout=timeout)
        self.db_config = {
            'dbname': db_database,
            'user': db_user,
            'password': db_password,
            'host': db_host
        }
        self.last_temperature = None
        self.last_humidity = None

    def read_data(self):
        """Legge e processa i dati dalla porta seriale e ritorna una lista con temperatura e umidità."""
        while True:
            line = self.ser.readline().decode('utf-8').strip()
            temperature, humidity = line.split(",")

            # Converte i valori in float per una comparazione accurata
            temperature = float(temperature)
            humidity = float(humidity)
            db = Database(self.db_config)

            # Controlla se i valori sono cambiati
            if temperature != self.last_temperature or humidity != self.last_humidity:
                # Salva i nuovi valori nel database
                db.save_to_db(temperature, humidity)
                
                # Aggiorna gli ultimi valori salvati
                self.last_temperature = temperature
                self.last_humidity = humidity
                
                # Per debug, puoi stampare i dati ricevuti
                print(f"Temperatura={temperature}°C, Umidità={humidity}%")
                time.sleep(3600)  # Pausa di 60 secondi prima di leggere nuovamente
            else:
                pass
