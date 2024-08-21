from flask import Flask, render_template, jsonify
import psycopg2
from psycopg2 import Error
import psycopg2.extras
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import psutil

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
            ORDER BY hour DESC;
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




if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
