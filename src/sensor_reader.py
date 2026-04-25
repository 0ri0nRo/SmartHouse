import serial
import psycopg2
from datetime import datetime, timedelta
from client.PostgresClient import PostgresHandler
import psutil
from send_email import EmailSender, invia_allarme_email
import os

# Database connection variables
db_host = os.getenv('DB_HOST')
db_database = os.getenv('DB_DATABASE')
db_user = os.getenv('DB_USER')
db_password = os.getenv('DB_PASSWORD')

# Database connection
def get_db_connection():
    """Create and return a database connection."""
    return psycopg2.connect(
        dbname=db_database,
        user=db_user,
        password=db_password,
        host=db_host
    )

class SensorReader:
    def __init__(self, port, baud_rate, timeout):
        """Initialize the serial connection and the database connection."""
        self.ser = serial.Serial(port, baud_rate, timeout=timeout)
        self.db_config = {
            'dbname': db_database,
            'user': db_user,
            'password': db_password,
            'host': db_host
        }
        self.last_temperature = None
        self.last_humidity = None
        self.last_record_time = datetime.now()  # Timestamp of the last record
        self.db = PostgresHandler(self.db_config)
        
        # Email configuration
        self.smtp_server = os.getenv('SMTP_SERVER')
        self.smtp_port = os.getenv('SMTP_PORT')
        self.username = os.getenv('EMAIL_USERNAME')
        self.password = os.getenv('EMAIL_PASSWORD')
        self.email_sender = EmailSender(self.smtp_server, self.smtp_port, self.username, self.password)
        
        self.last_alarm_time = datetime.now()
        self.last_backup_time = datetime.now()
        self.db = PostgresHandler(self.db_config)


    def read_data(self):
        """Read and process data from the serial port and return temperature and humidity."""
        try:
            while True:
                line = self.ser.readline().decode('utf-8').strip()
                temperature, humidity, distance = line.split(",")

                # Convert values to float for accurate comparisons
                temperature = float(temperature) - 1.7  # Subtract 1.7 degrees to compensate for residual heat from the power strip and align the reading with the boiler thermostat
                humidity = float(humidity)
                distance = int(distance)
                #print("Eseguo script di backup")
                # Run the backup if more than 24 hours have passed since the last execution
                #if datetime.now() - self.last_backup_time >= timedelta(minutes=1):
                #    os.system('./backup.sh')
                #    print("Eseguito script di backup")
                #    self.last_backup_time = datetime.now()


                last_alarm = self.db.get_last_alarm_status()
                status = last_alarm["status"]
                 # Get the current timestamp as a datetime object
                check_timestamp = datetime.now()
                print(f"status: {status}, distance: {distance}")
                # Check whether enough time has passed since the last alarm
                if status == "true" and distance < 80:
                    print(f"pre-alarm send, {check_timestamp} \n")

                    # Check whether enough time has passed since the last alarm
                    if (check_timestamp - self.last_alarm_time) >= timedelta(seconds=10):  # 10-second interval
                        invia_allarme_email(self.email_sender)
                        #print("invio allarme")

                        # Update the timestamp of the last alarm
                        self.last_alarm_time = check_timestamp

                if temperature <= 45 and temperature >=8 and humidity <= 90:
                    # Check whether the values have changed
                    if temperature != self.last_temperature or humidity != self.last_humidity:
                        # Save the new values in the database
                        self.db.save_to_db(temperature, humidity)
                        
                        # Update the last saved values
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
        """Read and return CPU temperature, CPU usage, and Raspberry Pi memory and storage statistics."""
        try:
            # Read CPU temperature
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as temp_file:
                temp_str = temp_file.read().strip()
                temperature = float(temp_str) / 1000.0
            
            # Get CPU usage
            cpu_usage = psutil.cpu_percent(interval=1)
            
            # Get RAM statistics
            memory = psutil.virtual_memory()
            memory_used = memory.used / (1024 ** 3)  # Convert to GB
            memory_total = memory.total / (1024 ** 3)  # Convert to GB
            
            # Get storage (SD) statistics
            disk = psutil.disk_usage('/')
            disk_used = disk.used / (1024 ** 3)  # Convert to GB
            disk_total = disk.total / (1024 ** 3)  # Convert to GB
            disk_free = disk.free / (1024 ** 3)   # Convert to GB
            
            # Build the data dictionary
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
            print("Temperature file not found.")
            return None
        except PermissionError:
            print("Insufficient permissions to access the temperature file.")
            return None
        except Exception as e:
            print(f"Error reading statistics: {e}")
            return None
