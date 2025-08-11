import psycopg2
import nmap
from datetime import datetime
import logging
from models.database import BaseService

logger = logging.getLogger(__name__)

class NetworkService(BaseService):
    """Servizio per gestire la scansione e il monitoraggio dei dispositivi di rete"""
    
    def scan_network(self, network='192.168.178.0/24'):
        """Scansiona la rete per trovare dispositivi attivi"""
        nm = nmap.PortScanner()
        nm.scan(hosts=network, arguments='-sn')
        devices = {}
        
        for host in nm.all_hosts():
            hostname = nm[host].hostname() or 'Unknown'
            devices[host] = {'hostname': hostname, 'status': nm[host].state()}
        
        # Salva nel database
        self._save_devices_to_db(devices)
        return devices
    
    def _save_devices_to_db(self, devices):
        """Salva i dispositivi trovati nel database"""
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            
            # Crea la tabella se non exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS network_devices (
                    id SERIAL PRIMARY KEY,
                    ip_address VARCHAR(45) NOT NULL,
                    hostname VARCHAR(255),
                    status VARCHAR(50),
                    timestamp TIMESTAMP NOT NULL
                );
            """)
            conn.commit()
            
            ts = datetime.now()
            insert_q = "INSERT INTO network_devices (ip_address, hostname, status, timestamp) VALUES (%s, %s, %s, %s)"
            for ip, info in devices.items():
                cur.execute(insert_q, (ip, info['hostname'], info['status'], ts))
            conn.commit()
        except Exception as e:
            logger.error(f"Error saving network devices: {e}")
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_device_stats(self):
        """Ottiene statistiche sui dispositivi di rete"""
        query = """
            SELECT hostname, COUNT(*) AS connection_count
            FROM network_devices
            WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
            GROUP BY hostname
            ORDER BY connection_count DESC;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            cur.execute(query)
            stats = cur.fetchall()
            result = []
            for stat in stats:
                hostname = (stat[0] or '')[:-10]
                if not hostname:
                    hostname = "Fritzbox-modem1234567890"
                if stat[1] >= 100:
                    result.append({'ip_address': hostname, 'connection_count': stat[1]})
            return result
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_most_connected_days(self):
        """Ottiene i giorni con più connessioni per dispositivo"""
        query = """
            SELECT hostname, EXTRACT(DOW FROM timestamp) AS day_of_week, COUNT(*) AS connection_count
            FROM network_devices
            WHERE hostname NOT IN ('raspberrypi.fritz.box', 'Fritzbox-Modem.fritz.box', 'fritz.box')
            GROUP BY hostname, day_of_week
            ORDER BY hostname, day_of_week;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            cur.execute(query)
            stats = cur.fetchall()
            
            total_counts = {}
            for stat in stats:
                hostname = (stat[0] or '')[:-10] or "Fritzbox-Modem"
                total_counts[hostname] = total_counts.get(hostname, 0) + stat[2]
            
            top_devices = sorted(total_counts.items(), key=lambda item: item[1], reverse=True)[:10]
            result = {hostname: [0]*7 for hostname, _ in top_devices}
            
            for stat in stats:
                hostname = (stat[0] or '')[:-10] or "Fritzbox-Modem"
                day = int(stat[1])
                count = stat[2]
                if hostname in result:
                    result[hostname][day] += count
            
            return result
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_latest_devices(self):
        """Ottiene l'ultimo scan dei dispositivi"""
        query = """
            SELECT * FROM network_devices 
            WHERE timestamp = (SELECT MAX(timestamp) FROM network_devices) 
            ORDER BY timestamp DESC;
        """
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query)
            devices = cur.fetchall()
            
            devices_list = []
            for device in devices:
                hostname_trim = (device['hostname'] or '')[:-10]
                if hostname_trim == "":
                    hostname_trim = "Fritzbox-modem1234567890"
                devices_list.append({
                    'id': device['id'],
                    'ip_address': device['ip_address'],
                    'hostname': hostname_trim,
                    'status': device['status'],
                    'last_seen': device['timestamp'].isoformat()[:-7]
                })
            return devices_list
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()