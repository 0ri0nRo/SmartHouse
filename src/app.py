from flask import Flask, render_template, request, jsonify, send_from_directory
import psycopg2.extras
import os
from dotenv import load_dotenv
import psutil
import nmap
import psycopg2
from scraper import TrainScraper
from client.PostgresClient import PostgresHandler 
from datetime import datetime, timedelta
from datetime import datetime
from client.MongoClient import MongoDBHandler
from bson import ObjectId
import subprocess
from send_email import EmailSender, invia_backup_email
from flask_cors import CORS
import paramiko
from io import StringIO
from expenses_gsheet import GoogleSheetExpenseManager, SheetValueFetcher
import traceback
from psycopg2 import Error
from datetime import datetime, timedelta
import logging
import json
from decimal import Decimal

# Configura logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Custom JSON encoder per gestire Decimal e datetime
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super(CustomJSONEncoder, self).default(obj)

app = Flask(__name__)
app.json_encoder = CustomJSONEncoder

# Configura il logging per debug migliore
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
credentials_path = os.path.join(BASE_DIR, "gcredentials.json")  # Modifica se serve
sheet_name = "My NW"  # Cambia con il tuo nome foglio

manager = GoogleSheetExpenseManager(credentials_path, sheet_name)
app = Flask(__name__)
CORS(app)  # Abilita CORS per il frontend
load_dotenv()

URI = os.getenv('MONGO_URI')
db_handler = MongoDBHandler(URI, 'local', 'lista_spesa')

# Configurazione del database
db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

db = PostgresHandler(db_config)

# Configurazione dell'email
smtp_server = os.getenv('SMTP_SERVER')
smtp_port = os.getenv('SMTP_PORT')
username = os.getenv('EMAIL_USERNAME')
password = os.getenv('EMAIL_PASSWORD')
email_sender = EmailSender(smtp_server, smtp_port, username, password)


@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'favicon.ico')

@app.route('/expenses')
def expenses():
    """Visualizza la pagina Hello World."""
    return render_template('expenses.html')

def scan_network(network='192.168.178.0/24'):
    """Scansiona la rete utilizzando nmap e salva i dispositivi nel database."""

    nm = nmap.PortScanner()
    nm.scan(hosts=network, arguments='-sn')  # -sn per una scansione ping semplice
    devices = {}

    for host in nm.all_hosts():
        hostname = nm[host].hostname() or 'Unknown'
        devices[host] = {
            'hostname': hostname,
            'status': nm[host].state()
        }

    # Salva i dispositivi nel database
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor()
        
        # Assicurati che la tabella esista
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS network_devices (
            id SERIAL PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            hostname VARCHAR(255),
            status VARCHAR(50),
            timestamp TIMESTAMP NOT NULL
        );
        """)
        connection.commit()

        query = """
        INSERT INTO network_devices (ip_address, hostname, status, timestamp) 
        VALUES (%s, %s, %s, %s)
        """
        timestamp = datetime.now()  # Ottieni il timestamp corrente
        for ip, info in devices.items():
            values = (ip, info['hostname'], info['status'], timestamp)
            cursor.execute(query, values)
        connection.commit()

        cursor.close()
        connection.close()
        print("Dispositivi di rete inseriti nel database.")
    except Error as e:
        print(f"Errore durante l'inserimento dei dati: {e}")

    return devices

@app.route('/api/devices/stats', methods=['GET'])
def get_device_stats():
    """Restituisce statistiche sui dispositivi di rete."""
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor()
        
        # Query per ottenere il conteggio totale delle connessioni per ogni IP
        cursor.execute("""
        SELECT
            hostname,
            COUNT(*) AS connection_count
        FROM
            network_devices
        WHERE
            hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
        GROUP BY
            hostname
        ORDER BY
            connection_count DESC;
        """)
        
        stats = cursor.fetchall()
        cursor.close()
        connection.close()

        # Formatta i risultati in un dizionario con slicing dell'hostname
        result = []
        for stat in stats:
            hostname = stat[0][:-10]  # Slicing per rimuovere gli ultimi 10 caratteri
            if hostname == "":
                hostname = "Fritzbox-modem1234567890"  # Valore di default se vuoto

            if stat[1] >= 100:
                result.append({
                    'ip_address': hostname,
                    'connection_count': stat[1]
                })
            else:
                pass
        
        return jsonify(result), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/devices/most_connected_days', methods=['GET'])
def get_most_connected_days():
    """Restituisce i giorni maggiormente connessi per i top 10 dispositivi con connection_count maggiore."""
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor()

        # Query per ottenere il conteggio delle connessioni per ciascun IP e giorno della settimana
        cursor.execute("""
        SELECT
            hostname,
            EXTRACT(DOW FROM timestamp) AS day_of_week, -- 0=Sunday, 1=Monday, ..., 6=Saturday
            COUNT(*) AS connection_count
        FROM
            network_devices
        WHERE
            hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
        GROUP BY
            hostname, day_of_week
        ORDER BY
            hostname, day_of_week;
        """)

        stats = cursor.fetchall()
        cursor.close()
        connection.close()

        # Raccogliere i conteggi totali per ciascun dispositivo
        total_counts = {}
        for stat in stats:
            hostname = stat[0][:-10]  # Slicing per rimuovere gli ultimi 10 caratteri
            if hostname == "":
                hostname = "Fritzbox-Modem"  # Valore di default se vuoto

            connection_count = stat[2]
            total_counts[hostname] = total_counts.get(hostname, 0) + connection_count

        # Ordina i dispositivi per connection_count e prendi i top 10
        top_devices = sorted(total_counts.items(), key=lambda item: item[1], reverse=True)[:10]

        # Formatta i risultati per i top 10 dispositivi
        result = {}
        for hostname, _ in top_devices:
            result[hostname] = [0] * 7  # Inizializza un array per i giorni della settimana

        # Riempi i conteggi dei giorni per i top 10 dispositivi
        for stat in stats:
            hostname = stat[0][:-10]  # Slicing per rimuovere gli ultimi 10 caratteri
            if hostname == "":
                hostname = "Fritzbox-Modem"  # Valore di default se vuoto

            day_of_week = int(stat[1])  # Converti in intero
            connection_count = stat[2]

            if hostname in result:  # Controlla se il dispositivo è nei top 10
                result[hostname][day_of_week] += connection_count  # Somma il conteggio per il giorno

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



def get_monthly_temperature_data():
    """Recupera la temperatura media per ogni giorno per ogni mese dell'anno corrente."""
    monthly_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la temperatura media per ogni giorno di ogni mese dell'anno corrente
        cursor.execute("""
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                EXTRACT(DAY FROM timestamp) AS day,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
            GROUP BY month, day
            ORDER BY month, day;
        """)
        
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            month = int(row['month'])
            day = int(row['day'])
            avg_temperature = round(float(row['avg_temperature']), 2)
            
            if month not in monthly_data:
                monthly_data[month] = {}
            
            monthly_data[month][day] = avg_temperature

        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati mensili: {e}")
    
    return monthly_data


@app.route('/api/monthly_temperature')
def api_monthly_temperature():
    """Restituisce la temperatura media per ogni giorno di ogni mese dell'anno corrente."""
    data = get_monthly_temperature_data()
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile.'}), 404

    return jsonify(data)


def get_data():
    """Recupera i dati dal database."""
    data = []
    last_entry = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la media delle temperature per ogni ora del giorno corrente
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                AVG(temperature_c) AS avg_temperature,
                AVG(humidity) AS humidity 
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour ASC;
        """)
        data = cursor.fetchall()

        # Ottieni l'ultima temperatura e umidità
        cursor.execute("SELECT temperature_c, humidity FROM sensor_readings ORDER BY timestamp DESC LIMIT 1")
        last_entry = cursor.fetchone()

        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    return data, last_entry



@app.route('/api/devices', methods=['GET'])
def get_devices():
    """API endpoint to get all devices from the database."""
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        cursor.execute("""SELECT *
                FROM network_devices
                WHERE timestamp = (SELECT MAX(timestamp) FROM network_devices)
                ORDER BY timestamp DESC;
            """)
        devices = cursor.fetchall()
        
        cursor.close()
        connection.close()

        

        # Converti i risultati in un formato JSON serializzabile
        devices_list = []
        for device in devices:
            if device['hostname'][:-10] == "":
                device['hostname'] = "Fritzbox-modem1234567890"
            devices_list.append({
                'id': device['id'],
                'ip_address': device['ip_address'],
                'hostname': device['hostname'][:-10],
                'status': device['status'],
                'last_seen': device['timestamp'].isoformat()[:-7]
            })

        return jsonify(devices_list)
    except Exception as e:
        print(f"Errore nell'endpoint /api/devices: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500



@app.route('/')
def index():
    """Visualizza i dati nella pagina principale."""
    data, last_entry = get_data()

    # Prepara i dati per i grafici
    # Estrai le etichette (ore) e le temperature
    labels = [f"{int(entry['hour'])}:00" for entry in data]  # Utilizza ore per le etichette
    temperatures = [entry['avg_temperature'] for entry in data]

    # Inverti l'ordine delle liste
    labels.reverse()
    temperatures.reverse()

    # Gestisci i casi in cui last_entry è None
    last_temperature = last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A'
    last_humidity = last_entry.get('humidity', 'N/A') if last_entry else 'N/A'
    return render_template('index.html', labels=labels, temperatures=temperatures, last_temperature=last_temperature, last_humidity=last_humidity)


@app.route('/api_raspberry_pi_stats')
def raspberry_pi_stats():
    """Restituisce la temperatura della CPU, l'uso della CPU, e le statistiche di memoria e archiviazione del Raspberry Pi."""
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
        return jsonify(stats)
        
    except FileNotFoundError:
        return jsonify({'error': 'File di temperatura non trovato.'}), 404
    except PermissionError:
        return jsonify({'error': 'Permessi insufficienti per accedere al file di temperatura.'}), 403
    except Exception as e:
        return jsonify({'error': f'Errore durante la lettura delle statistiche: {e}'}), 500


@app.route('/api_sensors')
def api_sensors():
    """Restituisce i dati del database in formato JSON."""
    data, last_entry = get_data()

    if not data:
        # Se non ci sono dati, restituisci un errore
        return jsonify({
            'error': 'Nessun dato disponibile.'
        }), 404

    try:
        # Supponiamo che 'data' sia una lista di dizionari con le chiavi 'avg_temperature' e 'humidity'
        min_temp = min(entry['avg_temperature'] for entry in data)
        max_temp = max(entry['avg_temperature'] for entry in data)

        # Calcola il minimo, massimo e la media dell'umidità
        min_hum = min(entry.get('humidity', float('inf')) for entry in data)
        max_hum = max(entry.get('humidity', float('-inf')) for entry in data)
        avg_hum = sum(entry.get('humidity', 0) for entry in data) / len(data)

        # Formattazione con due cifre decimali
        min_temp = f"{min_temp:.2f}"
        max_temp = f"{max_temp:.2f}"
        min_hum = f"{min_hum:.2f}" if min_hum != float('inf') else "N/A"
        max_hum = f"{max_hum:.2f}" if max_hum != float('-inf') else "N/A"
        avg_hum = f"{avg_hum:.2f}" if len(data) > 0 else "N/A"

        # Formattazione dei dati per i grafici
        chart_data_temperature = [f"{entry['avg_temperature']:.2f}" for entry in data]
        chart_data_humidity = [f"{entry.get('humidity', 'N/A'):.2f}" for entry in data]

    except KeyError as e:
        return jsonify({
            'error': f'Chiave mancante nei dati: {e}'
        }), 500

    return jsonify({
        'temperature': {
            'current': f"{last_entry.get('temperature_c', 'N/A'):.2f}" if last_entry else 'N/A',
            'minMaxLast24Hours': [min_temp, max_temp],
            'chartData': chart_data_temperature
        },
        'humidity': {
            'current': f"{last_entry.get('humidity', 'N/A'):.2f}" if last_entry else 'N/A',
            'minMaxLast24Hours': [min_hum, max_hum],
            'average': avg_hum,  # Aggiungi la media dell'umidità
            'chartData': chart_data_humidity
        },
        'labels': [f"{int(entry['hour'])}:00" for entry in data]  # Solo orario
    })


@app.route('/temp')
def temp():
    """Visualizza la pagina Hello World."""
    return render_template('temperature.html')


@app.route('/umid')
def umid():
    """Visualizza la pagina Hello World."""
    return render_template('umid.html')



@app.route('/train')
def train():
    """Visualizza la pagina Hello World."""
    return render_template('train.html')


@app.route('/air_quality')
def air_quality():
    """Visualizza la pagina della qualità dell'aria."""
    return render_template('air_quality.html')


@app.route('/raspi')
def raspi():
    """Visualizza la pagina Hello World."""
    return render_template('raspi.html')

@app.route('/security')
def security():
    """Visualizza la pagina Hello World."""
    return render_template('security.html')


def get_average_monthly_temperature():
    """Recupera la temperatura media per ogni mese dell'anno corrente."""
    monthly_avg_temperature = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la temperatura media per ogni mese dell'anno corrente
        cursor.execute("""
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
            GROUP BY month
            ORDER BY month;
        """)
        
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            month = int(row['month'])
            avg_temperature = float(row['avg_temperature'])
            monthly_avg_temperature[month] = avg_temperature
        
        print(f"Monthly average temperature data fetched: {monthly_avg_temperature}")

        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati mensili: {e}")
    
    return monthly_avg_temperature

@app.route('/api/monthly_average_temperature')
def api_monthly_average_temperature():
    """Restituisce la temperatura media per ogni mese dell'anno corrente."""
    data = get_average_monthly_temperature()
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile.'}), 404

    return jsonify(data)

def get_daily_temperature_for_month(month):
    """Recupera la temperatura media per ogni giorno del mese selezionato."""
    daily_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la temperatura media per ogni giorno del mese selezionato
        cursor.execute("""
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(MONTH FROM timestamp) = %s
            AND DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
            GROUP BY day
            ORDER BY day;
        """, (month,))
        
        rows = cursor.fetchall()
        
        
        # Organizza i dati in un dizionario
        for row in rows:
            day = int(row['day'])
            avg_temperature = float(row['avg_temperature'])
            daily_data[day] = avg_temperature
        
        cursor.close()
        connection.close()
        
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return daily_data

@app.route('/api/daily_temperature/<int:month>/', methods=['GET'])
def api_daily_temperature(month):
    """Restituisce la temperatura media per ogni giorno del mese selezionato."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400
    
    data = get_daily_temperature_for_month(month)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese selezionato.'}), 404

    return jsonify(data)

@app.route('/api/monthly_average_temperature/<int:mese>/<int:anno>', methods=['GET'])
def api_monthly_average_temperature_by_month_and_year(mese, anno):
    """Restituisce la temperatura media per ogni giorno del mese e anno selezionati."""
    if mese < 1 or mese > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400

    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400

    data = get_daily_temperature_for_month_and_year(mese, anno)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese e anno selezionati.'}), 404

    return jsonify(data)

def get_daily_temperature_for_month_and_year(month, year):
    """Recupera la temperatura media per ogni giorno del mese e anno selezionati."""
    daily_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la temperatura media per ogni giorno del mese e anno selezionati
        cursor.execute("""
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(MONTH FROM timestamp) = %s
            AND EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY day
            ORDER BY day;
        """, (month, year))
        
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            day = int(row['day'])
            avg_temperature = round(float(row['avg_temperature']), 2)
            daily_data[day] = avg_temperature
        
        cursor.close()
        connection.close()
        
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return daily_data

def get_monthly_average_temperature(year):
    """Recupera la temperatura media per ogni mese dell'anno specificato."""
    monthly_avg_temperature = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        cursor.execute("""
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY month
            ORDER BY month;
        """, (year,))
        
        rows = cursor.fetchall()
        
        for row in rows:
            month = int(row['month'])
            avg_temperature = round(float(row['avg_temperature']), 2)
            monthly_avg_temperature[month] = avg_temperature
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati mensili: {e}")
    
    return monthly_avg_temperature

@app.route('/api/monthly_average_temperature/<int:anno>', methods=['GET'])
def api_monthly_average_temperature_by_year(anno):
    """Restituisce la temperatura media per ogni mese dell'anno selezionato."""
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400

    data = get_monthly_average_temperature(anno)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per l\'anno selezionato.'}), 404

    return jsonify(data)
    
def get_daily_temperature():
    """Recupera la temperatura media per ogni ora del giorno corrente."""
    hourly_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni la temperatura media per ogni ora del giorno corrente
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                AVG(temperature_c) AS avg_temperature
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """)
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            hour = int(row['hour'])
            avg_temperature = round(float(row['avg_temperature']), 2)
            hourly_data[hour] = avg_temperature
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return hourly_data

@app.route('/api/today_temperature', methods=['GET'])
def today_temperature():
    """Restituisce la temperatura media per ogni ora del giorno corrente."""
    data = get_daily_temperature()
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per oggi.'}), 404

    return jsonify(data)



# Funzione per ottenere l'umidità media per ogni ora del giorno corrente
def get_hourly_humidity():
    """Recupera l'umidità media per ogni ora del giorno corrente."""
    hourly_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni l'umidità media per ogni ora del giorno corrente
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                AVG(humidity) AS avg_humidity
            FROM sensor_readings
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY hour
            ORDER BY hour;
        """)
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            hour = int(row['hour'])
            avg_humidity = round(float(row['avg_humidity']), 2)
            hourly_data[hour] = avg_humidity
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return hourly_data

@app.route('/api/today_humidity', methods=['GET'])
def today_humidity():
    """Restituisce l'umidità media per ogni ora del giorno corrente."""
    data = get_hourly_humidity()
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per oggi.'}), 404

    return jsonify(data)

# Funzione per ottenere l'umidità media per ogni giorno del mese selezionato
def get_daily_humidity_for_month(month):
    """Recupera l'umidità media per ogni giorno del mese selezionato."""
    daily_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni l'umidità media per ogni giorno del mese selezionato
        cursor.execute("""
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                AVG(humidity) AS avg_humidity
            FROM sensor_readings
            WHERE EXTRACT(MONTH FROM timestamp) = %s
            AND DATE_PART('year', timestamp) = DATE_PART('year', CURRENT_DATE)
            GROUP BY day
            ORDER BY day;
        """, (month,))
        
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            day = int(row['day'])
            avg_humidity = round(float(row['avg_humidity']), 2)
            daily_data[day] = avg_humidity
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return daily_data

@app.route('/api/daily_humidity/<int:month>/', methods=['GET'])
def api_daily_humidity(month):
    """Restituisce l'umidità media per ogni giorno del mese selezionato."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400
    
    data = get_daily_humidity_for_month(month)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese selezionato.'}), 404

    return jsonify(data)

# Funzione per ottenere l'umidità media per ogni giorno del mese e anno selezionati
def get_daily_humidity_for_month_and_year(month, year):
    """Recupera l'umidità media per ogni giorno del mese e anno selezionati."""
    daily_data = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni l'umidità media per ogni giorno del mese e anno selezionati
        cursor.execute("""
            SELECT
                EXTRACT(DAY FROM timestamp) AS day,
                AVG(humidity) AS avg_humidity
            FROM sensor_readings
            WHERE EXTRACT(MONTH FROM timestamp) = %s
            AND EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY day
            ORDER BY day;
        """, (month, year))
        
        rows = cursor.fetchall()
        
        # Organizza i dati in un dizionario
        for row in rows:
            day = int(row['day'])
            avg_humidity = round(float(row['avg_humidity']), 2)
            daily_data[day] = avg_humidity
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return daily_data

@app.route('/api/daily_humidity/<int:month>/<int:year>', methods=['GET'])
def api_daily_humidity_by_month_and_year(month, year):
    """Restituisce l'umidità media per ogni giorno del mese e anno selezionati."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400

    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400

    data = get_daily_humidity_for_month_and_year(month, year)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese e anno selezionati.'}), 404

    return jsonify(data)

# Funzione per ottenere l'umidità media per ogni mese dell'anno selezionato
def get_monthly_humidity_for_year(year):
    """Recupera l'umidità media per ogni mese dell'anno specificato."""
    monthly_avg_humidity = {}
    try:
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Ottieni l'umidità media per ogni mese dell'anno specificato
        cursor.execute("""
            SELECT
                EXTRACT(MONTH FROM timestamp) AS month,
                AVG(humidity) AS avg_humidity
            FROM sensor_readings
            WHERE EXTRACT(YEAR FROM timestamp) = %s
            GROUP BY month
            ORDER BY month;
        """, (year,))
        
        rows = cursor.fetchall()
        
        for row in rows:
            month = int(row['month'])
            avg_humidity = round(float(row['avg_humidity']), 2)
            monthly_avg_humidity[month] = avg_humidity
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati mensili: {e}")
    
    return monthly_avg_humidity

@app.route('/api/monthly_average_humidity/<int:year>', methods=['GET'])
def api_monthly_humidity_by_year(year):
    """Restituisce l'umidità media per ogni mese dell'anno selezionato."""
    if year < 1900 or year > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400

    data = get_monthly_humidity_for_year(year)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per l\'anno selezionato.'}), 404

    return jsonify(data)



def get_average_temperatures(start, end):
    """
    Query to get the average temperature for each hour within the specified range.
    """
    try:
        # Connect to the database
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # SQL query to get average temperatures grouped by hour
        query = """
        SELECT DATE_TRUNC('hour', timestamp) AS hour, AVG(temperature_c) AS avg_temp
        FROM sensor_readings
        WHERE timestamp BETWEEN %s AND %s
        GROUP BY hour
        ORDER BY hour;
        """

        # Execute the query with parameters (start and end)
        cursor.execute(query, (start, end))

        # Fetch the results
        results = cursor.fetchall()

        # Create the response data
        data = [{
            "hour": row['hour'].isoformat(),  # Format the datetime object as ISO 8601 string
            "avg_temperature": round(row['avg_temp'], 2)
        } for row in results]

        return data

    except psycopg2.DatabaseError as error:
        print(f"Database access error: {error}")
        return None
    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if connection:
            connection.close()

    
@app.route('/api/temperature_average/<start_datetime>/<end_datetime>', methods=['GET'])
def temperature_average(start_datetime, end_datetime):
    try:
        # Validate and parse datetime strings
        start_datetime = datetime.fromisoformat(start_datetime)
        end_datetime = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS)'}), 400

    # Get average temperatures
    data = get_average_temperatures(start_datetime, end_datetime)
    
    if data is None:
        return jsonify({'error': 'Failed to fetch data. Check logs for details.'}), 500

    return jsonify(data), 200



def get_average_umid(start, end):
    """
    Query to get the average umid for each hour within the specified range.
    """
    try:
        # Connect to the database
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # SQL query to get average humidity grouped by hour
        query = """
        SELECT DATE_TRUNC('hour', timestamp) AS hour, AVG(humidity) AS avg_humidity
        FROM sensor_readings
        WHERE timestamp BETWEEN %s AND %s
        GROUP BY hour
        ORDER BY hour;
        """

        # Execute the query with parameters (start and end)
        cursor.execute(query, (start, end))

        # Fetch the results
        results = cursor.fetchall()

        # Create the response data
        data = [{
            "hour": row['hour'].isoformat(),  # Format the datetime object as ISO 8601 string
            "avg_humidity": round(row['avg_humidity'], 2)
        } for row in results]

        return data

    except psycopg2.DatabaseError as error:
        print(f"Database access error: {error}")
        return None
    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if connection:
            connection.close()

    
@app.route('/api/humidity_average//<start_datetime>/<end_datetime>', methods=['GET'])
def umid_average(start_datetime, end_datetime):
    try:
        # Validate and parse datetime strings
        start_datetime = datetime.fromisoformat(start_datetime)
        end_datetime = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS)'}), 400

    # Get average umid
    data = get_average_umid(start_datetime, end_datetime)
    
    if data is None:
        return jsonify({'error': 'Failed to fetch data. Check logs for details.'}), 500

    return jsonify(data), 200



@app.route('/api/monthly_average_humidity/<int:mese>/<int:anno>', methods=['GET'])
def api_monthly_average_umidity_by_month_and_year(mese, anno):
    """Restituisce la umidità media per ogni giorno del mese e anno selezionati."""
    if mese < 1 or mese > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400

    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400

    data = get_daily_humidity_for_month_and_year(mese, anno)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese e anno selezionati.'}), 404

    return jsonify(data)


@app.route('/trains_data/<train_destination>', methods=['GET'])
def get_trains_data_route(train_destination):
    """Gestisce la richiesta per ottenere i dati dei treni per una destinazione specifica."""
    # URL da cui recuperare i dati
    url = "https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2416&arrivals=False"
    
    # Creazione dell'oggetto TrainScraper
    scraper = TrainScraper(url, db_config)

    # Connessione al database
    connection = psycopg2.connect(**db_config)
    cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        # Recupera e salva i dati dei treni nel database
        trains = scraper.parse_trains(train_destination)
        scraper.save_trains_to_db(trains)

        # Recupera i treni precedenti e successivi per la destinazione fornita
        result = get_trains_data(cursor, train_destination)

        # Chiude la connessione al database
        cursor.close()
        connection.close()

        return jsonify(result)

    except Exception as e:
        # Gestisci eventuali eccezioni
        return jsonify({"error": str(e)}), 500



def get_trains_data(cursor, destination, limit=4):
    """Recupera i treni prima e dopo l'orario corrente per una destinazione specificata e restituisce i risultati come JSON."""
    try:
        now = datetime.now()
        db.create_table_if_not_exists_trains()
        # Query per i treni passati
        query_old = """
        SELECT train_number, destination, time, delay, platform, stops, timestamp
        FROM trains
        WHERE time < %s 
          AND stops ILIKE %s
        ORDER BY time DESC
        LIMIT %s;
        """
        cursor.execute(query_old, (now.time(), f'%{destination}%', limit))
        results_old = cursor.fetchall()

        # Query per i treni futuri
        query = """
        SELECT train_number, destination, time, delay, platform, stops, timestamp
        FROM trains
        WHERE time > %s 
          AND stops ILIKE %s
        ORDER BY time ASC
        LIMIT %s;
        """
        cursor.execute(query, (now.time(), f'%{destination}%', limit))
        results = cursor.fetchall()

        # Converti i risultati in un formato JSON serializzabile
        def serialize_row(row):
            return {
                "train_number": row[0],
                "destination": row[1],
                "time": row[2].strftime('%H:%M'),  # Converti time in stringa
                "delay": row[3],
                "platform": row[4],
                "stops": row[5],
                "timestamp": row[6].isoformat()  # Converti timestamp in stringa ISO
            }
        
        formatted_results = {
            "result": [serialize_row(row) for row in results],
            "result_old": [serialize_row(row) for row in results_old]
        }

        return formatted_results

    except Exception as e:
        print(f"Errore durante il recupero dei treni: {e}")
        return {"error": str(e)}




@app.route('/trains_data/<destination>', methods=['GET'])
def trains_data(destination):
    try:
        # Connessione al database
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Chiama la funzione per ottenere i dati dei treni
        results = get_trains_data(cursor, destination)
        
        cursor.close()
        connection.close()
        
        # Restituisci i risultati come JSON
        return jsonify(results)

    except Exception as e:
        print(f"Errore durante il recupero dei dati dei treni: {e}")
        return jsonify({"error": str(e)}), 500


# Route per recuperare l'ultimo valore booleano
@app.route('/security/alarm', methods=['GET', 'POST'])
def alarm_status():
    connection = None
    cursor = None
    try:
        # Connessione al database
        connection = psycopg2.connect(**db_config)
        cursor = connection.cursor(cursor_factory=psycopg2.extras.DictCursor)

        if request.method == 'GET':
            # Recupera l'ultimo valore booleano
            query = """
                SELECT status, timestamp 
                FROM alarms_status 
                ORDER BY timestamp DESC 
                LIMIT 1;
            """
            cursor.execute(query)
            last_alarm_status = cursor.fetchone()

            if last_alarm_status:
                return jsonify(last_alarm_status), 200
            else:
                return jsonify({'status': False, 'timestamp': None}), 200

        elif request.method == 'POST':
            # Inserisci un nuovo valore booleano
            data = request.get_json()

            if 'status' in data:
                status = data['status']

                # Query per eliminare tutti i valori esistenti
                delete_query = "DELETE FROM alarms_status;"
                cursor.execute(delete_query)

                query = """
                    INSERT INTO alarms_status (status) 
                    VALUES (%s);
                """
                cursor.execute(query, (status,))
                connection.commit()

                return jsonify({'message': 'Stato dell\'allarme aggiornato correttamente.'}), 201
            else:
                return jsonify({'error': 'Campo "status" mancante nel body della richiesta.'}), 400

    except Exception as e:
        return jsonify({'error': f'Si è verificato un errore: {e}'}), 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route('/last_temp', methods=['GET'])
def last_temp():
    try:
        result = db.last_temp_db()
        return result    
    except:
        pass




def get_db_connection():
    """Crea una connessione al database con gestione errori migliorata."""
    try:
        connection = psycopg2.connect(**db_config)
        return connection
    except psycopg2.OperationalError as e:
        logger.error(f"Errore di connessione al database: {e}")
        raise
    except Exception as e:
        logger.error(f"Errore generico di connessione: {e}")
        raise

def handle_db_error(func):
    """Decorator per gestire errori comuni del database."""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except psycopg2.OperationalError as e:
            logger.error(f"Errore operazionale database in {func.__name__}: {e}")
            return jsonify({
                'error': 'Database connection error',
                'message': 'Temporary database unavailability'
            }), 503
        except psycopg2.Error as e:
            logger.error(f"Errore database in {func.__name__}: {e}")
            return jsonify({
                'error': 'Database error',
                'message': str(e)
            }), 500
        except Exception as e:
            logger.error(f"Errore generico in {func.__name__}: {e}")
            return jsonify({
                'error': 'Internal server error',
                'message': str(e)
            }), 500
    wrapper.__name__ = func.__name__
    return wrapper

@app.route('/air_quality_data', methods=['GET'])
@handle_db_error
def air_quality_data():
    """Gestisce la richiesta per ottenere i dati più recenti della qualità dell'aria."""
    connection = None
    cursor = None
    
    try:
        logger.info("Richiesta dati qualità dell'aria più recenti")
        
        # Connessione al database
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Query per ottenere l'ultimo record
        query = """
        SELECT 
            smoke, lpg, methane, hydrogen, 
            air_quality_index, air_quality_description, 
            timestamp,
            EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
        FROM air_quality 
        ORDER BY timestamp DESC, id DESC
        LIMIT 1;
        """
        
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result:
            # Converti in dizionario normale e gestisci i tipi
            data = dict(result)
            data['smoke'] = float(data['smoke'])
            data['lpg'] = float(data['lpg'])
            data['methane'] = float(data['methane'])
            data['hydrogen'] = float(data['hydrogen'])
            data['air_quality_index'] = float(data['air_quality_index'])
            data['timestamp'] = data['timestamp'].isoformat()
            data['data_age_seconds'] = int(data['seconds_ago'])
            data['is_recent'] = data['seconds_ago'] < 300  # Considera recenti dati < 5 minuti
            
            logger.info(f"Dati trovati: AQI={data['air_quality_index']}, Age={data['data_age_seconds']}s")
            return jsonify(data), 200
        else:
            logger.warning("Nessun dato disponibile nella tabella air_quality")
            return jsonify({
                "error": "No data available",
                "message": "Nessun dato disponibile nella tabella."
            }), 404

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route('/api/last_air_quality_today', methods=['GET'])
@handle_db_error
def api_last_air_quality_today():
    """Restituisce l'ultima rilevazione di qualità dell'aria di oggi."""
    connection = None
    cursor = None
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        query = """
            SELECT 
                smoke, lpg, methane, hydrogen, 
                air_quality_index, air_quality_description, 
                timestamp
            FROM air_quality
            WHERE DATE(timestamp) = CURRENT_DATE
            ORDER BY timestamp DESC
            LIMIT 1;
        """
        
        cursor.execute(query)
        row = cursor.fetchone()

        if not row:
            return jsonify({
                'error': 'No data found',
                'message': 'Nessun dato disponibile per oggi'
            }), 404

        # Conversioni per compatibilità JSON
        result = dict(row)
        result['smoke'] = float(result['smoke'])
        result['lpg'] = float(result['lpg'])
        result['methane'] = float(result['methane'])
        result['hydrogen'] = float(result['hydrogen'])
        result['air_quality_index'] = float(result['air_quality_index'])
        result['timestamp'] = result['timestamp'].isoformat()

        return jsonify(result), 200

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()



@app.route('/api/air_quality', methods=['GET', 'POST'])
@handle_db_error
def air_quality_func():
    """Gestisce GET (tutti i dati) e POST (inserimento nuovo dato) per qualità dell'aria."""
    connection = None
    cursor = None
    
    try:
        # Connessione al database
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        if request.method == 'GET':
            logger.info("Richiesta di tutti i dati qualità dell'aria")
            
            # Parametri opzionali per filtri
            limit = request.args.get('limit', 1000, type=int)
            limit = min(limit, 5000)  # Limita a massimo 5000 record
            
            hours_back = request.args.get('hours', 24, type=int)
            hours_back = min(hours_back, 168)  # Massimo 1 settimana
            
            # Query con filtri temporali
            query = """
                SELECT 
                    smoke, lpg, methane, hydrogen, 
                    air_quality_index, air_quality_description, 
                    timestamp,
                    EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
                FROM air_quality 
                WHERE timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp DESC
                LIMIT %s;
            """
            
            cursor.execute(query, (hours_back, limit))
            results = cursor.fetchall()

            if results:
                # Converti i risultati in formato JSON compatibile
                air_quality_data = []
                for row in results:
                    data = dict(row)
                    data['smoke'] = float(data['smoke'])
                    data['lpg'] = float(data['lpg'])
                    data['methane'] = float(data['methane'])
                    data['hydrogen'] = float(data['hydrogen'])
                    data['air_quality_index'] = float(data['air_quality_index'])
                    data['timestamp'] = data['timestamp'].isoformat()
                    data['data_age_seconds'] = int(data['seconds_ago'])
                    air_quality_data.append(data)
                
                logger.info(f"Restituiti {len(air_quality_data)} record")
                return jsonify({
                    'data': air_quality_data,
                    'count': len(air_quality_data),
                    'hours_requested': hours_back,
                    'limit_applied': limit
                }), 200
            else:
                logger.warning(f"Nessun dato trovato nelle ultime {hours_back} ore")
                return jsonify({
                    'error': 'No data found',
                    'message': f'Nessun dato disponibile nelle ultime {hours_back} ore.',
                    'count': 0
                }), 404

        elif request.method == 'POST':
            logger.info("Richiesta inserimento nuovo dato qualità dell'aria")
            
            # Validazione Content-Type
            if not request.is_json:
                return jsonify({'error': 'Content-Type deve essere application/json'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Body della richiesta vuoto o malformato'}), 400

            # Lista dei campi richiesti
            required_fields = ['smoke', 'lpg', 'methane', 'hydrogen', 'air_quality_index', 'air_quality_description']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                return jsonify({
                    'error': 'Campi mancanti',
                    'missing_fields': missing_fields,
                    'required_fields': required_fields
                }), 400

            # Validazione tipi di dati
            try:
                smoke = float(data['smoke'])
                lpg = float(data['lpg'])
                methane = float(data['methane'])
                hydrogen = float(data['hydrogen'])
                air_quality_index = float(data['air_quality_index'])
                air_quality_description = str(data['air_quality_description']).strip()
                
                # Validazione range valori (opzionale, adatta ai tuoi sensori)
                if not (0 <= smoke <= 1000):
                    raise ValueError("smoke deve essere tra 0 e 1000")
                if not (0 <= lpg <= 1000):
                    raise ValueError("lpg deve essere tra 0 e 1000")
                if not (0 <= methane <= 1000):
                    raise ValueError("methane deve essere tra 0 e 1000")
                if not (0 <= hydrogen <= 1000):
                    raise ValueError("hydrogen deve essere tra 0 e 1000")
                if not (0 <= air_quality_index <= 500):
                    raise ValueError("air_quality_index deve essere tra 0 e 500")
                if not air_quality_description:
                    raise ValueError("air_quality_description non può essere vuoto")
                    
            except (ValueError, TypeError) as e:
                return jsonify({
                    'error': 'Validazione dati fallita',
                    'message': str(e)
                }), 400

            # Inserimento nel database
            timestamp = datetime.now()
            query = """
                INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, timestamp;
            """
            
            cursor.execute(query, (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp))
            result = cursor.fetchone()
            connection.commit()
            
            logger.info(f"Nuovo record inserito con ID: {result['id']}")
            
            return jsonify({
                'message': 'Dati di qualità dell\'aria salvati correttamente.',
                'id': result['id'],
                'timestamp': result['timestamp'].isoformat(),
                'data': {
                    'smoke': smoke,
                    'lpg': lpg,
                    'methane': methane,
                    'hydrogen': hydrogen,
                    'air_quality_index': air_quality_index,
                    'air_quality_description': air_quality_description
                }
            }), 201

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

def get_daily_air_quality():
    """Recupera l'indice medio della qualità dell'aria per ogni ora del giorno corrente."""
    hourly_data = {}
    connection = None
    cursor = None
    
    try:
        logger.info("Recupero dati qualità dell'aria giornalieri")
        
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Query migliorata con più informazioni
        query = """
            SELECT
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(air_quality_index)::numeric, 2) AS avg_air_quality_index,
                COUNT(*) as measurement_count,
                MIN(air_quality_index) as min_aqi,
                MAX(air_quality_index) as max_aqi
            FROM air_quality
            WHERE DATE(timestamp) = CURRENT_DATE
              AND timestamp >= CURRENT_DATE
              AND timestamp < CURRENT_DATE + INTERVAL '1 day'
            GROUP BY EXTRACT(HOUR FROM timestamp)
            ORDER BY hour;
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            logger.warning("Nessun dato trovato per oggi")
            return {}
        
        # Organizza i dati in un dizionario
        for row in rows:
            hour = int(row['hour'])
            hourly_data[hour] = {
                'avg_air_quality_index': float(row['avg_air_quality_index']),
                'measurement_count': int(row['measurement_count']),
                'min_aqi': float(row['min_aqi']),
                'max_aqi': float(row['max_aqi'])
            }
        
        logger.info(f"Dati orari recuperati per {len(hourly_data)} ore")
        
    except Exception as e:
        logger.error(f"Errore durante il recupero dei dati giornalieri: {e}")
        
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
    
    return hourly_data

last_aggregation_time = None

@app.route('/api/gas_concentration_today', methods=['GET'])
def api_gas_concentration_today():
    """Returns today's hourly gas concentration data."""
    try:
        logger.info("Richiesta dati concentrazione gas")
        
        global last_aggregation_time
        current_time = datetime.now()

        # Check if the aggregation function should run
        if last_aggregation_time is None or (current_time - last_aggregation_time) >= timedelta(hours=1):
            try:
                db.create_temp_table_and_aggregate_air_quality()
                last_aggregation_time = current_time
                logger.info("Aggregazione completata")
            except Exception as e:
                logger.error(f"Errore durante aggregazione: {e}")
                # Continua comunque a recuperare i dati

        # Retrieve the hourly gas concentration data
        data = get_hourly_gas_concentration()
        
        if not data:
            logger.warning("Nessun dato gas disponibile")
            return jsonify({'error': 'Nessun dato disponibile'}), 404

        logger.info(f"Restituendo dati gas per {len(data)} ore")
        
        # Debug: stampa i primi dati
        sample_hours = list(data.keys())[:3]
        for hour in sample_hours:
            logger.info(f"Ora {hour}: {data[hour]}")
        
        return jsonify(data)
        
    except Exception as e:
        logger.error(f"Errore nell'endpoint gas_concentration_today: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Errore interno del server: {str(e)}'}), 500



@app.route('/api/air_quality_today', methods=['GET'])
@handle_db_error
def api_air_quality_today():
    """Restituisce la qualità dell'aria giornaliera con formato semplificato per il frontend."""
    logger.info("Richiesta API per dati AQI giornalieri")
    
    data = get_daily_air_quality()
    
    if not data:
        logger.warning("Nessun dato giornaliero disponibile")
        return jsonify({
            'error': 'No data available', 
            'message': 'Nessun dato disponibile per oggi'
        }), 404

    # Formato semplificato per il frontend esistente
    simplified_data = {}
    for hour, values in data.items():
        simplified_data[str(hour)] = values['avg_air_quality_index']
    
    logger.info(f"Restituiti dati per {len(simplified_data)} ore")
    return jsonify(simplified_data), 200

def get_hourly_gas_concentration():
    """Recupera le concentrazioni medie orarie di gas per il giorno corrente."""
    hourly_data = {}
    connection = None
    cursor = None
    
    try:
        logger.info("Recupero concentrazioni gas orarie")
        
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Query semplificata e corretta
        query = """
            SELECT 
                EXTRACT(HOUR FROM timestamp) AS hour,
                ROUND(AVG(smoke)::numeric, 2) AS avg_smoke,
                ROUND(AVG(lpg)::numeric, 2) AS avg_lpg,
                ROUND(AVG(methane)::numeric, 2) AS avg_methane,
                ROUND(AVG(hydrogen)::numeric, 2) AS avg_hydrogen,
                COUNT(*) as measurement_count
            FROM air_quality 
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY EXTRACT(HOUR FROM timestamp)
            ORDER BY hour;
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            logger.warning("Nessun dato gas trovato per oggi")
            # Restituisci dati di esempio se non ci sono dati reali
            for hour in range(24):
                hourly_data[str(hour)] = {
                    'avg_smoke': 0.0,
                    'avg_lpg': 0.0,
                    'avg_methane': 0.0,
                    'avg_hydrogen': 0.0,
                    'measurement_count': 0
                }
            return hourly_data
        
        # Organizza i risultati
        for row in rows:
            hour = str(int(row['hour']))  # Converti in stringa per coerenza
            hourly_data[hour] = {
                'avg_smoke': float(row['avg_smoke'] or 0),
                'avg_lpg': float(row['avg_lpg'] or 0),
                'avg_methane': float(row['avg_methane'] or 0),
                'avg_hydrogen': float(row['avg_hydrogen'] or 0),
                'measurement_count': int(row['measurement_count'])
            }
        
        logger.info(f"Dati gas recuperati per {len(hourly_data)} ore")
        return hourly_data
        
    except Exception as e:
        logger.error(f"Errore durante il recupero concentrazioni gas: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # In caso di errore, restituisci dati vuoti ma validi
        for hour in range(24):
            hourly_data[str(hour)] = {
                'avg_smoke': 0.0,
                'avg_lpg': 0.0,
                'avg_methane': 0.0,
                'avg_hydrogen': 0.0,
                'measurement_count': 0
            }
        return hourly_data
        
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

@app.route('/todolist/insert', methods=['POST'])
def insert_documents():
    documents = request.json
    db_handler = MongoDBHandler(URI, 'local', 'lista_spesa')
    db_handler.add_shopping_item(documents['item_name'], documents['quantity'], documents['store'], documents['timestamp'])
    return jsonify({"message": "Documents inserted successfully"}), 201

@app.route('/todolist/today', methods=['GET'])
def get_documents_today():
    db_handler = MongoDBHandler(URI, 'local', 'lista_spesa')
    documents = db_handler.read_today_items()
    return jsonify(documents), 200

@app.route('/lista-spesa', methods=['GET'])
def get_todolist():
    # Assuming you want to return a JSON response instead of rendering an HTML template
    return render_template("index-lista.html") , 200

@app.route('/todolist/delete/<item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Elimina un item dalla lista della spesa"""
    try:
        # Controlla se l'ID è valido
        if not ObjectId.is_valid(item_id):
            return jsonify({"message": "Invalid item ID"}), 400

        # Esegui la cancellazione tramite la funzione delete_item
        result = db_handler.delete_item(item_id)

        # Se il risultato ha "deleted_count" maggiore di 0, significa che l'elemento è stato cancellato
        if result.get("deleted_count", 0) > 0:
            return jsonify(result), 200
        else:
            return jsonify(result), 404  # Restituisci un errore 404 se l'elemento non è stato trovato

    except Exception as e:
        return jsonify({"message": f"Error deleting item: {e}"}), 500

@app.route('/todolist/update/<start_timestamp>/<end_timestamp>', methods=['GET'])
def search_by_timestamp(start_timestamp, end_timestamp):
    try:
        # Usando la funzione range_timestamp per ottenere i documenti
        documents = db_handler.range_timestamp(start_timestamp, end_timestamp)
        
        if not documents:
            return jsonify({"message": "Nessun elemento trovato."}), 404
        
        # Restituiamo i risultati in formato JSON
        return jsonify(documents), 200
    except Exception as e:
        return jsonify({"message": f"Error: {e}"}), 500 

@app.route('/api_run_backup', methods=['POST'])
def run_backup():
    """Esegue il backup tramite backup.sh e invia un'email."""
    try:
        # Percorso del file di backup all'interno del contenitore Docker
        backup_script_path = '/usr/local/bin/backup.sh'

        # Verifica se il file di backup esiste nel percorso previsto
        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Il file di backup non è stato trovato.'}), 404

        # Esegue il backup
        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        
        # Log di output per il debug
        print('Output backup:', result.stdout)
        print('Errori backup:', result.stderr)

        if result.returncode == 0:
            invia_backup_email(email_sender)  # Funzione per inviare email
            return jsonify({'message': 'Backup eseguito con successo.', 'output': result.stdout}), 200
        else:
            return jsonify({'error': 'Errore durante l\'esecuzione del backup.', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'error': f'Si è verificato un errore: {e}'}), 500

@app.route('/api/ssh_exec', methods=['POST'])
def ssh_exec():
    try:
        data = request.get_json()
        private_key_str = data.get('privateKey')
        command = data.get('command')
        passphrase = data.get('passphrase') or None  # può essere stringa vuota o None

        if not private_key_str or not command:
            return jsonify({"error": "Chiave privata o comando mancante"}), 400

        HOST_PI = os.getenv('HOST_PI')
        PORT_PI = os.getenv('PORT_PI')
        USERNAME_PI = os.getenv('USERNAME_PI')

        key_file = StringIO(private_key_str)
        private_key = None

        for key_class in [paramiko.ECDSAKey, paramiko.RSAKey, paramiko.Ed25519Key, paramiko.DSSKey]:
            try:
                key_file.seek(0)
                private_key = key_class.from_private_key(key_file, password=passphrase)
                break
            except paramiko.PasswordRequiredException:
                return jsonify({"error": "Questa chiave richiede una passphrase."}), 400
            except paramiko.SSHException:
                continue

        if private_key is None:
            return jsonify({"error": "Formato della chiave non supportato o chiave corrotta."}), 400

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        client.connect(hostname=HOST_PI, port=PORT_PI, username=USERNAME_PI, pkey=private_key)

        stdin, stdout, stderr = client.exec_command(command)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')

        client.close()

        return jsonify({"output": output if output else error})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/expenses', methods=['POST', 'GET'])
def add_expense():
    if request.method == 'POST':
        try:
            data = request.get_json()
            description = data.get('description')  # Cambiato da 'name'
            date = data.get('date')
            amount = data.get('amount')
            category = data.get('category')

            if not all([description, date, amount, category]):
                return jsonify({"error": "Missing one or more fields"}), 400

            manager.add_expense(description, date, amount, category)
            return jsonify({"message": "Expense added successfully"}), 201

        except ValueError as ve:
            return jsonify({"error": str(ve)}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif request.method == 'GET':
        try:
            summary = manager.get_summary_expenses()  # Default sheet name is '2025 expenses'
            return jsonify(summary), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route('/api/p48', methods=['GET'])
def get_p48_value():
    try:
        fetcher = SheetValueFetcher(
            credentials_path=credentials_path,
            sheet_name="My NW",
            redis_host=os.getenv("REDIS_HOST", "redis"),
            redis_port=int(os.getenv("REDIS_PORT", 6379))
        )

        # Recupera il valore dalla cache (se esiste)
        cached_value = fetcher.get_cached_value()

        # Prova a ottenere il nuovo valore live e aggiornare la cache
        try:
            live_value = fetcher.get_cell_value_p48()
            live_value = float(live_value.replace(",", "."))
        except Exception as e:
            live_value = None  # In caso di errore, continuiamo solo con il valore cache

        response = {
            "cached_value": float(cached_value.replace(",", ".")) if cached_value else None,
            "P48_value": live_value
        }
        return jsonify(response), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)