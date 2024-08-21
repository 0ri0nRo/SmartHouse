from sensor_reader import SensorReader
import os
from dotenv import load_dotenv
from database.database import Database

# Carica le variabili di ambiente dal file .env
load_dotenv()


def main():
    """Funzione principale per eseguire il programma."""
    port = '/dev/ttyACM0'  # Porta seriale
    baud_rate = 9600  # Baud rate
    timeout = 10  # Timeout in secondi
    

    
    reader = SensorReader(port, baud_rate, timeout)
    reader.read_data()

if __name__ == "__main__":
    main()



