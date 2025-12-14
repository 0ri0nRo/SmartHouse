from sensor_reader import SensorReader
from dotenv import load_dotenv
from thermostat_daemon import ThermostatDaemon
import threading

# Carica le variabili d'ambiente dal file .env
load_dotenv()

def main():
    """Funzione principale per eseguire il programma."""
    port = '/dev/ttyACM0'  # Porta seriale
    baud_rate = 9600  # Baud rate
    timeout = 10  # Timeout in secondi
        
    reader = SensorReader(port, baud_rate, timeout)
    thermostat = ThermostatDaemon()
    thermostat_thread = threading.Thread(
        target=thermostat.run,
        daemon=True
    )
    thermostat_thread.start()
    reader.read_data()


if __name__ == "__main__":
    main()



