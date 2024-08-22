from flask import Flask, render_template, jsonify
import psycopg2
from psycopg2 import Error
import psycopg2.extras
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import psutil
import nmap
# Carica le variabili di ambiente dal file .env
load_dotenv()

app = Flask(__name__)

# Configurazione del database
db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}



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
            avg_temperature = float(row['avg_temperature'])
            
            if month not in monthly_data:
                monthly_data[month] = {}
            
            monthly_data[month][day] = avg_temperature
        
        print(f"Monthly temperature data fetched: {monthly_data}")

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
        print(f"Data fetched: {data}")

        # Ottieni l'ultima temperatura e umidità
        cursor.execute("SELECT temperature_c, humidity FROM sensor_readings ORDER BY timestamp DESC LIMIT 1")
        last_entry = cursor.fetchone()
        print(f"Last entry fetched: {last_entry}")

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
                'timestamp': device['timestamp'].isoformat()[:-7]
            })

        return jsonify(devices_list)
    except Exception as e:
        print(f"Errore nell'endpoint /api/devices: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500



@app.route('/main')
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
            day = row['day']
            avg_temperature = float(row['avg_temperature'])
            daily_data[day] = avg_temperature
        
        cursor.close()
        connection.close()
    except Error as e:
        print(f"Errore durante il recupero dei dati: {e}")
    
    return daily_data

@app.route('/api/daily_temperature/<int:month>', methods=['GET'])
def api_daily_temperature(month):
    """Restituisce la temperatura media per ogni giorno del mese selezionato."""
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido. Deve essere tra 1 e 12.'}), 400
    
    data = get_daily_temperature_for_month(month)
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile per il mese selezionato.'}), 404

    return jsonify(data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)