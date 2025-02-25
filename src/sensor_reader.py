import serial
import psycopg2
from datetime import datetime, timedelta
from client.PostgresClient import PostgresHandler
import psutil
from send_email import EmailSender, invia_allarme_email
import os

# Definizione delle variabili di connessione al database
db_host = os.getenv('DB_HOST')
db_database = os.getenv('DB_DATABASE')
db_user = os.getenv('DB_USER')
db_password = os.getenv('DB_PASSWORD')

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
        self.db = PostgresHandler(self.db_config)
        
        # Configurazione dell'email
        self.smtp_server = os.getenv('SMTP_SERVER')
        self.smtp_port = os.getenv('SMTP_PORT')
        self.username = os.getenv('EMAIL_USERNAME')
        self.password = os.getenv('EMAIL_PASSWORD')
        self.email_sender = EmailSender(self.smtp_server, self.smtp_port, self.username, self.password)
        
        self.last_alarm_time = datetime.now()
        self.last_backup_time = datetime.now()
        self.db = PostgresHandler(self.db_config)


    def read_data(self):
        """Legge e processa i dati dalla porta seriale e ritorna una lista con temperatura e umidità."""
        try:
            while True:
                line = self.ser.readline().decode('utf-8').strip()
                temperature, humidity, distance = line.split(",")

                # Converte i valori in float per una comparazione accurata
                temperature = float(temperature)
                humidity = float(humidity)
                distance = int(distance)
                #print("Eseguo script di backup")
                # Esegui il backup se è passato più di 24 ore dall'ultima esecuzione
                #if datetime.now() - self.last_backup_time >= timedelta(minutes=1):
                #    os.system('./backup.sh')
                #    print("Eseguito script di backup")
                #    self.last_backup_time = datetime.now()


                last_alarm = self.db.get_last_alarm_status()
                status = last_alarm["status"]
                 # Ottieni il timestamp corrente come oggetto datetime
                check_timestamp = datetime.now()
                print(f"status: {status}, distance: {distance}")
                # Verifica se è passato abbastanza tempo dall'ultimo allarme
                if status == "true" and distance < 80:
                    print(f"pre - invio allarme, {check_timestamp} \n")

                    # Verifica se è passato abbastanza tempo dall'ultimo allarme
                    if (check_timestamp - self.last_alarm_time) >= timedelta(seconds=10):  # Intervallo di 10 secondi
                        invia_allarme_email(self.email_sender)
                        #print("invio allarme")

                        # Aggiorna il timestamp dell'ultimo allarme
                        self.last_alarm_time = check_timestamp

                if temperature <= 45 and temperature >=8 and humidity <= 90:
                    # Controlla se i valori sono cambiati
                    if temperature != self.last_temperature or humidity != self.last_humidity:
                        # Salva i nuovi valori nel database
                        self.db.save_to_db(temperature, humidity)
                        
                        # Aggiorna gli ultimi valori salvati
                        self.last_temperature = temperature
                        self.last_humidity = humidity
                        self.db.create_temp_table_and_aggregate_data()
                    #current_time = datetime.now()
                    #if current_time - self.last_aggregation_time >= timedelta(minutes=60):
                        #self.db.create_temp_table_and_aggregate_data()  # Esegui l'aggregazione
                        #self.last_aggregation_time = current_time  # Aggiorna il tempo dell'ultima aggregazione

        except Exception as e:
            pass


    def get_raspberry_pi_stats():
        """Legge e ritorna la temperatura della CPU, l'uso della CPU, e le statistiche di memoria e archiviazione del Raspberry Pi."""
        try:
            # Leggi la temperatura della CPU
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as temp_file:
                temp_str = temp_file.read().strip()
                temperature = float(temp_str) / 1000.0
            
            # Ottieni l'uso della CPU
            cpu_usage = psutil.cpu_percent(interval=1)
            
            # Ottieni le statistiche di memoria RAM
            memory = psutil.virtual_memory()
            memory_used = memory.used / (1024 ** 3)  # Converti in GB
            memory_total = memory.total / (1024 ** 3)  # Converti in GB
            
            # Ottieni le statistiche di memoria di archiviazione (SD)
            disk = psutil.disk_usage('/')
            disk_used = disk.used / (1024 ** 3)  # Converti in GB
            disk_total = disk.total / (1024 ** 3)  # Converti in GB
            disk_free = disk.free / (1024 ** 3)   # Converti in GB
            
            # Costruisci il dizionario con i dati
            stats = {
                'temperature': temperature,
                'cpuUsage': cpu_usage,
                'memoryUsed': f'{memory_used:.2f} GB',
                'memoryTotal': f'{memory_total:.2f} GB',
                'diskUsed': f'{disk_used:.2f} GB',
                'diskTotal': f'{disk_total:.2f} GB',
                'diskFree': f'{disk_free:.2f} GB'
            }
            return stats

        except FileNotFoundError:
            print("File di temperatura non trovato.")
            return None
        except PermissionError:
            print("Permessi insufficienti per accedere al file di temperatura.")
            return None
        except Exception as e:
            print(f"Errore durante la lettura delle statistiche: {e}")
            return None
