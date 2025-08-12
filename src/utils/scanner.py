import time
import os
from datetime import datetime
import nmap
import psycopg2
from psycopg2 import Error

# Carica le variabili di ambiente
from dotenv import load_dotenv
load_dotenv()

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

if __name__ == "__main__":
    while True:
        scan_network()
        time.sleep(60)  # Esegui la scansione ogni 60 minuti
