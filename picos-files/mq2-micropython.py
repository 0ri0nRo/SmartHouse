import network
import time
import urequests
import gc
import json
from mq2 import MQ2
from machine import Pin, ADC, reset
import _thread
import sys

# Wi-Fi credentials
SSID = 'YOUR_WIFI_SSID'
PASSWORD = 'YOUR_WIFI_PASSWORD'

# Server settings
URL = "https://192.168.178.101:4443/api/air_quality"
HEADERS = {"Content-Type": "application/json"}

# Configurazioni
MAX_RETRIES = 3
SENSOR_READ_INTERVAL = 30  # secondi tra le letture
CONNECTION_TIMEOUT = 15
SEND_TIMEOUT = 10
READINGS_FOR_AVERAGE = 3

# LED di stato (GPIO onboard del Pico W)
try:
    status_led = Pin("LED", Pin.OUT)
except:
    status_led = Pin(25, Pin.OUT)  # GPIO 25 su Pico normale

def blink_led(times=1, delay=0.2):
    """Fa lampeggiare il LED di stato."""
    for _ in range(times):
        status_led.on()
        time.sleep(delay)
        status_led.off()
        time.sleep(delay)

def print_memory_info():
    """Stampa informazioni sulla memoria."""
    free = gc.mem_free()
    allocated = gc.mem_alloc()
    print(f"Memory - Free: {free} bytes, Allocated: {allocated} bytes")

class SensorManager:
    def __init__(self, pin_data=26, base_voltage=3.3):
        """Inizializza il manager del sensore MQ2."""
        print("Initializing MQ2 sensor...")
        try:
            self.sensor = MQ2(pinData=pin_data, baseVoltage=base_voltage)
            print("Starting sensor calibration...")
            self.sensor.calibrate()
            print("✓ Sensor calibrated successfully")
            blink_led(2, 0.1)  # 2 lampeggi rapidi = calibrazione ok
        except Exception as e:
            print(f"✗ Sensor initialization failed: {e}")
            blink_led(5, 0.5)  # 5 lampeggi lenti = errore
            raise
        
        self.last_valid_reading = None
        
    def read_sensor_raw(self):
        """Legge i valori grezzi dal sensore."""
        try:
            smoke = self.sensor.readSmoke()
            lpg = self.sensor.readLPG()
            methane = self.sensor.readMethane()
            hydrogen = self.sensor.readHydrogen()
            
            return {
                'smoke': smoke,
                'lpg': lpg, 
                'methane': methane,
                'hydrogen': hydrogen
            }
        except Exception as e:
            print(f"Error reading sensor: {e}")
            return None
    
    def validate_reading(self, reading):
        """Valida una lettura del sensore."""
        if not reading:
            return False
            
        for key, value in reading.items():
            if value is None:
                print(f"None value for {key}")
                return False
            if not isinstance(value, (int, float)):
                print(f"Invalid type for {key}: {type(value)}")
                return False
            if value < 0 or value > 5000:  # Range ragionevole per MQ2
                print(f"Value out of range for {key}: {value}")
                return False
                
        return True
    
    def get_stable_reading(self):
        """Ottiene una lettura stabile mediando più misurazioni."""
        print("Taking sensor readings...")
        valid_readings = []
        
        for attempt in range(READINGS_FOR_AVERAGE * 2):  # Più tentativi se necessario
            reading = self.read_sensor_raw()
            
            if self.validate_reading(reading):
                valid_readings.append(reading)
                print(f"Valid reading {len(valid_readings)}: {reading}")
                
                if len(valid_readings) >= READINGS_FOR_AVERAGE:
                    break
            else:
                print(f"Invalid reading on attempt {attempt + 1}")
                
            time.sleep(0.5)  # Piccola pausa tra letture
            
        if len(valid_readings) < 2:  # Almeno 2 letture valide
            print("Not enough valid readings")
            return self.last_valid_reading  # Ritorna l'ultima lettura valida
        
        # Calcola la media
        avg_reading = {}
        for key in valid_readings[0].keys():
            values = [r[key] for r in valid_readings]
            avg_reading[key] = round(sum(values) / len(values), 2)
        
        self.last_valid_reading = avg_reading
        print(f"Stable reading (avg of {len(valid_readings)}): {avg_reading}")
        return avg_reading

class WiFiManager:
    def __init__(self, ssid, password):
        """Inizializza il manager WiFi."""
        self.ssid = ssid
        self.password = password
        self.wlan = network.WLAN(network.STA_IF)
        self.connection_attempts = 0
        
    def connect(self):
        """Connette al WiFi con retry."""
        if self.is_connected():
            print("✓ Already connected to WiFi")
            return True
        
        print(f"Connecting to WiFi: {self.ssid}")
        self.wlan.active(True)
        
        for attempt in range(MAX_RETRIES):
            try:
                print(f"Connection attempt {attempt + 1}/{MAX_RETRIES}")
                self.wlan.connect(self.ssid, self.password)
                
                # Aspetta connessione con timeout
                start_time = time.ticks_ms()
                while not self.wlan.isconnected():
                    if time.ticks_diff(time.ticks_ms(), start_time) > CONNECTION_TIMEOUT * 1000:
                        print(f"Timeout on attempt {attempt + 1}")
                        break
                    blink_led(1, 0.1)  # Lampeggio durante connessione
                    time.sleep(0.5)
                
                if self.wlan.isconnected():
                    config = self.wlan.ifconfig()
                    print(f"✓ Connected! IP: {config[0]}")
                    print(f"   Gateway: {config[2]}, DNS: {config[3]}")
                    blink_led(3, 0.1)  # 3 lampeggi = connesso
                    return True
                    
            except Exception as e:
                print(f"WiFi error on attempt {attempt + 1}: {e}")
            
            if attempt < MAX_RETRIES - 1:
                print("Retrying in 3 seconds...")
                time.sleep(3)
        
        print("✗ Failed to connect to WiFi")
        blink_led(10, 0.2)  # Molti lampeggi = errore WiFi
        return False
    
    def is_connected(self):
        """Verifica se connesso al WiFi."""
        return self.wlan.isconnected()
    
    def get_signal_info(self):
        """Ottiene informazioni sul segnale."""
        if not self.is_connected():
            return None
        try:
            # MicroPython non ha sempre scan() disponibile
            return {"status": "connected", "ip": self.wlan.ifconfig()[0]}
        except:
            return {"status": "connected"}

class DataSender:
    def __init__(self, url, headers):
        """Inizializza il sender dei dati."""
        self.url = url
        self.headers = headers
        self.successful_sends = 0
        self.failed_sends = 0
        
    def send_data(self, payload):
        """Invia dati al server."""
        if not payload:
            print("No payload to send")
            return False
        
        # Log del payload
        print("Sending payload:")
        for key, value in payload.items():
            print(f"  {key}: {value}")
        
        for attempt in range(MAX_RETRIES):
            try:
                print(f"HTTP POST attempt {attempt + 1}/{MAX_RETRIES}")
                
                # MicroPython urequests è più semplice
                response = urequests.post(
                    self.url,
                    json=payload,
                    headers=self.headers
                )
                
                print(f"HTTP Status: {response.status_code}")
                
                # Leggi risposta per debug (limitata)
                try:
                    response_text = response.text[:200]  # Primi 200 caratteri
                    print(f"Server response: {response_text}")
                except:
                    print("Could not read response")
                
                if response.status_code in [200, 201]:
                    print("✓ Data sent successfully")
                    response.close()
                    self.successful_sends += 1
                    blink_led(1, 0.05)  # Lampeggio veloce = successo
                    return True
                else:
                    print(f"✗ Server error: {response.status_code}")
                    
                response.close()
                
            except Exception as e:
                print(f"Send error (attempt {attempt + 1}): {e}")
                # Errori comuni in MicroPython
                if "ECONNRESET" in str(e):
                    print("Connection reset by server")
                elif "ETIMEDOUT" in str(e):
                    print("Connection timeout")
                elif "ENOTCONN" in str(e):
                    print("Not connected")
            
            if attempt < MAX_RETRIES - 1:
                print("Retrying in 2 seconds...")
                time.sleep(2)
        
        print("✗ Failed to send data after all attempts")
        self.failed_sends += 1
        blink_led(2, 0.3)  # 2 lampeggi lenti = errore invio
        return False
    
    def get_stats(self):
        """Ritorna statistiche di invio."""
        return {
            "successful": self.successful_sends,
            "failed": self.failed_sends,
            "success_rate": round(self.successful_sends / max(1, self.successful_sends + self.failed_sends) * 100, 2)
        }

def calculate_air_quality(smoke, lpg, methane, hydrogen):
    """Calcola l'indice di qualità dell'aria."""
    try:
        # Soglie semplificate per MicroPython
        thresholds = {
            'smoke': [30, 100, 250, 400],
            'lpg': [15, 40, 80, 150],
            'methane': [10, 30, 70, 120],
            'hydrogen': [8, 20, 50, 90]
        }
        
        def get_level(value, limits):
            """Calcola il livello di pericolo (1-5)."""
            level = 1
            for threshold in limits:
                if value > threshold:
                    level += 1
            return min(level, 5)
        
        # Calcola livelli
        levels = [
            get_level(smoke, thresholds['smoke']),
            get_level(lpg, thresholds['lpg']),
            get_level(methane, thresholds['methane']),
            get_level(hydrogen, thresholds['hydrogen'])
        ]
        
        avg_level = sum(levels) / len(levels)
        
        # Converti in AQI (0-100)
        if avg_level <= 1.5:
            aqi = round(95 - (avg_level - 1) * 10, 1)
            description = "Good"
        elif avg_level <= 2.5:
            aqi = round(85 - (avg_level - 1.5) * 15, 1)
            description = "Moderate"
        elif avg_level <= 3.5:
            aqi = round(70 - (avg_level - 2.5) * 20, 1)
            description = "Poor"
        elif avg_level <= 4.5:
            aqi = round(50 - (avg_level - 3.5) * 25, 1)
            description = "Very Poor"
        else:
            aqi = round(25 - (avg_level - 4.5) * 25, 1)
            aqi = max(aqi, 0)
            description = "Hazardous"
        
        print(f"Gas levels: {levels}, Avg: {avg_level:.2f}, AQI: {aqi}")
        return float(aqi), description
        
    except Exception as e:
        print(f"Error calculating AQI: {e}")
        return 50.0, "Unknown"

def should_send_data(current_data, last_sent_data):
    """Determina se i dati sono cambiati abbastanza da essere inviati."""
    if not last_sent_data:
        return True
    
    # Soglie di cambiamento minimo
    thresholds = {
        'smoke': 5.0,
        'lpg': 3.0,
        'methane': 3.0,
        'hydrogen': 2.0,
        'air_quality_index': 2.0
    }
    
    for key, threshold in thresholds.items():
        if abs(current_data.get(key, 0) - last_sent_data.get(key, 0)) > threshold:
            print(f"Significant change in {key}: {last_sent_data.get(key)} -> {current_data.get(key)}")
            return True
    
    return False

def main():
    """Funzione principale."""
    print("\n" + "="*50)
    print("🌬️  Air Quality Monitor - Pico W")
    print("="*50)
    print(f"Sensor interval: {SENSOR_READ_INTERVAL}s")
    print(f"Server URL: {URL}")
    
    # Inizializza LED
    status_led.off()
    
    # Inizializza componenti
    try:
        print("\n📶 Initializing WiFi...")
        wifi = WiFiManager(SSID, PASSWORD)
        
        print("\n🔬 Initializing Sensor...")
        sensor_manager = SensorManager()
        
        print("\n📡 Initializing Data Sender...")
        data_sender = DataSender(URL, HEADERS)
        
    except Exception as e:
        print(f"✗ Initialization failed: {e}")
        blink_led(20, 0.1)  # Molti lampeggi = errore grave
        return
    
    # Connetti WiFi iniziale
    if not wifi.connect():
        print("Cannot start without WiFi")
        return
    
    print("\n🚀 Starting main loop...")
    print("-" * 30)
    
    # Variabili di stato
    cycle_count = 0
    consecutive_errors = 0
    max_consecutive_errors = 5
    last_sent_data = None
    
    while True:
        try:
            cycle_count += 1
            print(f"\n--- Cycle {cycle_count} ---")
            
            # Controlla connessione WiFi
            if not wifi.is_connected():
                print("📶 WiFi disconnected, reconnecting...")
                if not wifi.connect():
                    print("WiFi reconnection failed, waiting...")
                    time.sleep(10)
                    continue
            
            # Leggi sensori
            print("📊 Reading sensors...")
            sensor_data = sensor_manager.get_stable_reading()
            
            if not sensor_data:
                print("✗ No valid sensor data")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    print("Too many sensor errors, restarting...")
                    time.sleep(5)
                    reset()
                time.sleep(5)
                continue
            
            # Reset errori consecutivi
            consecutive_errors = 0
            
            # Calcola qualità dell'aria
            aqi, description = calculate_air_quality(
                sensor_data['smoke'],
                sensor_data['lpg'],
                sensor_data['methane'],
                sensor_data['hydrogen']
            )
            
            # Prepara payload
            current_data = {
                "smoke": sensor_data['smoke'],
                "lpg": sensor_data['lpg'],
                "methane": sensor_data['methane'],
                "hydrogen": sensor_data['hydrogen'],
                "air_quality_index": aqi,
                "air_quality_description": description
            }
            
            # Controlla se inviare
            if should_send_data(current_data, last_sent_data):
                print("📡 Sending data...")
                if data_sender.send_data(current_data):
                    last_sent_data = current_data.copy()
                    print("✓ Data sent and cached")
                else:
                    print("✗ Data send failed")
            else:
                print("📊 No significant change, skipping send")
            
            # Statistiche ogni 10 cicli
            if cycle_count % 10 == 0:
                stats = data_sender.get_stats()
                print(f"\n📈 Stats after {cycle_count} cycles:")
                print(f"   Success rate: {stats['success_rate']}%")
                print(f"   Successful: {stats['successful']}")
                print(f"   Failed: {stats['failed']}")
                print_memory_info()
            
            # Cleanup memoria
            gc.collect()
            
            # Attendi prossimo ciclo
            print(f"⏳ Waiting {SENSOR_READ_INTERVAL}s...")
            time.sleep(SENSOR_READ_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n🛑 Program interrupted by user")
            break
        except Exception as e:
            print(f"✗ Unexpected error: {e}")
            consecutive_errors += 1
            if consecutive_errors >= max_consecutive_errors:
                print("Too many errors, restarting device...")
                time.sleep(5)
                reset()
            time.sleep(10)
    
    print("\n👋 Air Quality Monitor stopped")
    status_led.off()

# Gestore per reset automatico in caso di errori gravi
def watchdog():
    """Watchdog semplice per reset in caso di blocco."""
    start_time = time.ticks_ms()
    while True:
        time.sleep(300)  # 5 minuti
        # Se il programma è bloccato da più di 10 minuti, reset
        if time.ticks_diff(time.ticks_ms(), start_time) > 600000:  # 10 min
            print("Watchdog timeout - resetting...")
            reset()

# Avvia il programma
if __name__ == "__main__":
    print("🔄 Starting Air Quality Monitor...")
    
    # Lampeggio iniziale per indicare avvio
    for i in range(3):
        status_led.on()
        time.sleep(0.2)
        status_led.off()
        time.sleep(0.2)
    
    try:
        main()
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        print("Restarting in 10 seconds...")
        blink_led(50, 0.1)  # Lampeggi frenetici = errore fatale
        time.sleep(10)
        reset()