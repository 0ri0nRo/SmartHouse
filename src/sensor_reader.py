import serial
import json
import re
import time  # Importa il modulo time
from database.database import Database

class SensorReader:
    def __init__(self, port, baud_rate, timeout, db_config):
        """Inizializza la connessione seriale."""
        self.ser = serial.Serial(port, baud_rate, timeout=timeout)
        self.db_config = db_config
        # Inizializza gli ultimi valori salvati come None
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
            else:
                pass

            time.sleep(1)  # Pausa di 60 secondi prima di leggere nuovamente

