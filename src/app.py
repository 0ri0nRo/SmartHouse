from flask import Flask, render_template, jsonify
import mysql.connector
from mysql.connector import Error
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
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)
        
        # Ottieni gli ultimi 50 dati per i grafici
        cursor.execute("SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 50")
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
    labels = [entry['timestamp'] for entry in data]
    temperatures = [entry['temperature_c'] for entry in data]
    humidities = [entry['humidity'] for entry in data]

    # Inverti l'ordine delle liste
    labels.reverse()
    temperatures.reverse()
    humidities.reverse()

    last_temperature = last_entry.get('temperature_c', 'N/A')
    last_humidity = last_entry.get('humidity', 'N/A')

    return render_template('index.html', labels=labels, temperatures=temperatures, humidities=humidities, last_temperature=last_temperature, last_humidity=last_humidity)

@app.route('/api_sensors')
def api_sensors():
    """Restituisce i dati del database in formato JSON."""
    data, _ = get_data()
    return jsonify(data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

