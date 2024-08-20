from sensor_reader import SensorReader
import os
from dotenv import load_dotenv
from database.database import Database

# Carica le variabili di ambiente dal file .env
load_dotenv()

# Accesso alle variabili di ambiente
db_host = os.getenv('DB_HOST')
db_name = os.getenv('DB_DATABASE')
db_user = os.getenv('DB_USER')
db_password = os.getenv('DB_PASSWORD')
def main():
    """Funzione principale per eseguire il programma."""
    port = '/dev/ttyACM0'  # Porta seriale
    baud_rate = 9600  # Baud rate
    timeout = 10  # Timeout in secondi
    
    # Configurazione del database
    db_config = {
        'host': db_host,
        'database': db_name,
        'user': db_user,
        'password': db_password
    }
    
    reader = SensorReader(port, baud_rate, timeout, db_config)
    reader.read_data()

if __name__ == "__main__":
    main()



