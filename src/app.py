from flask import Flask, render_template, jsonify
import psycopg2
from psycopg2 import Error
import psycopg2.extras
import os
from dotenv import load_dotenv

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
        
        # Ottieni gli ultimi 50 dati per i grafici
        cursor.execute("SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 24")
        data = cursor.fetchall()

        # Ottieni l'ultima temperatura e umidità
        cursor.execute("SELECT temperature_c, humidity FROM sensor_readings ORDER BY timestamp DESC LIMIT 1")
        last_entry = cursor.fetchone()

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
    # Estrai le etichette (timestamp), temperature e humidities
    labels = [entry['timestamp'].strftime("%d-%m-%Y %H:%M:%S") for entry in data]
    temperatures = [entry['temperature_c'] for entry in data]
    humidities = [entry['humidity'] for entry in data]

    # Inverti l'ordine delle liste
    labels.reverse()
    temperatures.reverse()
    humidities.reverse()

    # Gestisci i casi in cui last_entry è None
    last_temperature = last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A'
    last_humidity = last_entry.get('humidity', 'N/A') if last_entry else 'N/A'

    return render_template('index.html', labels=labels, temperatures=temperatures, humidities=humidities, last_temperature=last_temperature, last_humidity=last_humidity)


@app.route('/api_sensors')
def api_sensors():
    """Restituisce i dati del database in formato JSON."""
    data, last_entry = get_data()

    # Restituisce sia i dati per i grafici che l'ultimo dato inserito
    return jsonify({
        'temperature': {
            'current': last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A',
            'minMaxLast24Hours': [min([entry['temperature_c'] for entry in data]), max([entry['temperature_c'] for entry in data])],
            'chartData': [entry['temperature_c'] for entry in data]
        },
        'humidity': {
            'current': last_entry.get('humidity', 'N/A') if last_entry else 'N/A',
            'minMaxLast24Hours': [min([entry['humidity'] for entry in data]), max([entry['humidity'] for entry in data])],
            'chartData': [entry['humidity'] for entry in data]
        },
        'labels': [entry['timestamp'].strftime("%d-%m-%Y %H:%M:%S") for entry in data]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
