import serial
import json
import re
import time
import psycopg2
from datetime import datetime, timedelta
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
        self.last_record_time = datetime.now()  # Timestamp dell'ultima registrazione

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

            else:
                pass

    def get_raspberry_pi_temperature(self):
        """Legge e ritorna la temperatura della CPU del Raspberry Pi."""
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as temp_file:
                temp_str = temp_file.read().strip()
                # La temperatura è in millesimi di grado Celsius, converti in gradi Celsius
                temperature = float(temp_str) / 1000.0
                return temperature
        except FileNotFoundError:
            print("File di temperatura non trovato.")
            return None
        except PermissionError:
            print("Permessi insufficienti per accedere al file di temperatura.")
            return None
        except Exception as e:
            print(f"Errore durante la lettura della temperatura: {e}")
            return None
