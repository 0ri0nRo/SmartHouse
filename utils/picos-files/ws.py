import network
import time
import urequests
import gc
import json
from mq2 import MQ2
from machine import Pin, ADC, reset, RTC
import _thread
import sys
import socket

# Wi-Fi credentials
SSID = ''
PASSWORD = ''

# Server settings
URL = "http://192.168.178.101:5000/api/air_quality"
WEBSOCKET_URL = "192.168.178.101"
WEBSOCKET_PORT = 5000
HEADERS = {"Content-Type": "application/json"}

# Configurazioni
MAX_RETRIES = 3
SENSOR_READ_INTERVAL = 30
CONNECTION_TIMEOUT = 15
SEND_TIMEOUT = 10
READINGS_FOR_AVERAGE = 3
HOURLY_SEND_INTERVAL = 3600
WEBSOCKET_RETRY_DELAY = 10

# LED di stato
try:
    status_led = Pin("LED", Pin.OUT)
except:
    status_led = Pin(25, Pin.OUT)

# WebSocket state
websocket_connected = False
websocket_socket = None
log_queue = []
MAX_LOG_QUEUE = 50

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

def get_current_timestamp():
    """Ritorna il timestamp corrente."""
    return time.time()

def format_timestamp(timestamp):
    """Formatta il timestamp in formato leggibile."""
    t = time.localtime(timestamp)
    return f"{t[2]:02d}/{t[1]:02d}/{t[0]} {t[3]:02d}:{t[4]:02d}:{t[5]:02d}"

def log_message(level, message, data=None):
    """Aggiunge un messaggio alla coda dei log."""
    global log_queue
    
    log_entry = {
        "level": level,
        "message": message,
        "timestamp": format_timestamp(get_current_timestamp()),
        "data": data
    }
    
    log_queue.append(log_entry)
    if len(log_queue) > MAX_LOG_QUEUE:
        log_queue = log_queue[-MAX_LOG_QUEUE:]
    
    print(f"[{log_entry['timestamp']}] [{level.upper()}] {message}")
    if data:
        print(f"    Data: {data}")
    
    send_websocket_log(log_entry)

def create_websocket_frame(data):
    """Crea un frame WebSocket per il testo."""
    try:
        payload = json.dumps(data)
        payload_bytes = payload.encode('utf-8')
        payload_length = len(payload_bytes)
        
        if payload_length < 126:
            frame = bytearray([0x81, payload_length])
        else:
            frame = bytearray([0x81, 126])
            frame.extend(payload_length.to_bytes(2, 'big'))
        
        frame.extend(payload_bytes)
        return bytes(frame)
    except Exception as e:
        print(f"Error creating WebSocket frame: {e}")
        return None

def connect_websocket():
    """Connette al WebSocket del server."""
    global websocket_connected, websocket_socket
    
    try:
        log_message("system", "Attempting WebSocket connection...")
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        
        # Prova prima la porta 8080 (server dedicato), poi 5000
        ports_to_try = [8080, 5000]
        connected = False
        
        for port in ports_to_try:
            try:
                log_message("system", f"Trying port {port}...")
                sock.connect((WEBSOCKET_URL, port))
                
                # Costruisce l'handshake WebSocket
                handshake = "GET /ws/logs HTTP/1.1\r\n"
                handshake += "Host: " + WEBSOCKET_URL + ":" + str(port) + "\r\n"
                handshake += "Upgrade: websocket\r\n"
                handshake += "Connection: Upgrade\r\n"
                handshake += "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                handshake += "Sec-WebSocket-Version: 13\r\n"
                handshake += "\r\n"
                
                sock.send(handshake.encode())
                response = sock.recv(1024).decode()
                
                if "101 Switching Protocols" in response:
                    websocket_socket = sock
                    websocket_connected = True
                    log_message("success", f"WebSocket connected on port {port}")
                    blink_led(2, 0.1)
                    return True
                else:
                    log_message("warning", f"Port {port} handshake failed: {response[:100]}")
                    sock.close()
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(10)
                    
            except Exception as port_error:
                log_message("warning", f"Port {port} failed: {port_error}")
                sock.close()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(10)
                continue
        
        log_message("error", "All WebSocket ports failed")
        return False
            
    except Exception as e:
        log_message("error", f"WebSocket connection failed: {e}")
        if 'sock' in locals():
            try:
                sock.close()
            except:
                pass
        return False

def send_websocket_log(log_entry):
    """Invia un log via WebSocket."""
    global websocket_connected, websocket_socket
    
    if not websocket_connected or not websocket_socket:
        return False
    
    try:
        frame = create_websocket_frame(log_entry)
        if frame:
            websocket_socket.send(frame)
            return True
    except Exception as e:
        print(f"WebSocket send failed: {e}")
        websocket_connected = False
        if websocket_socket:
            try:
                websocket_socket.close()
            except:
                pass
            websocket_socket = None
        return False
    
    return False

def disconnect_websocket():
    """Disconnette il WebSocket."""
    global websocket_connected, websocket_socket
    
    websocket_connected = False
    if websocket_socket:
        try:
            websocket_socket.close()
        except:
            pass
        websocket_socket = None

class SensorManager:
    def __init__(self, pin_data=26, base_voltage=3.3):
        """Inizializza il manager del sensore MQ2."""
        log_message("system", "Initializing MQ2 sensor...")
        try:
            self.sensor = MQ2(pinData=pin_data, baseVoltage=base_voltage)
            log_message("system", "Starting sensor calibration...")
            self.sensor.calibrate()
            log_message("success", "Sensor calibrated successfully")
            blink_led(2, 0.1)
        except Exception as e:
            log_message("error", f"Sensor initialization failed: {e}")
            blink_led(5, 0.5)
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
            log_message("error", f"Error reading sensor: {e}")
            return None
    
    def validate_reading(self, reading):
        """Valida una lettura del sensore."""
        if not reading:
            return False
            
        for key, value in reading.items():
            if value is None:
                log_message("warning", f"None value for {key}")
                return False
            if not isinstance(value, (int, float)):
                log_message("warning", f"Invalid type for {key}: {type(value)}")
                return False
            if value < 0 or value > 5000:
                log_message("warning", f"Value out of range for {key}: {value}")
                return False
                
        return True
    
    def get_stable_reading(self):
        """Ottiene una lettura stabile mediando piu misurazioni."""
        log_message("sensor", "Taking sensor readings...")
        valid_readings = []
        
        for attempt in range(READINGS_FOR_AVERAGE * 2):
            reading = self.read_sensor_raw()
            
            if self.validate_reading(reading):
                valid_readings.append(reading)
                log_message("sensor", f"Valid reading {len(valid_readings)}", reading)
                
                if len(valid_readings) >= READINGS_FOR_AVERAGE:
                    break
            else:
                log_message("warning", f"Invalid reading on attempt {attempt + 1}")
                
            time.sleep(0.5)
            
        if len(valid_readings) < 2:
            log_message("error", "Not enough valid readings")
            return self.last_valid_reading
        
        avg_reading = {}
        for key in valid_readings[0].keys():
            values = [r[key] for r in valid_readings]
            avg_reading[key] = round(sum(values) / len(values), 2)
        
        self.last_valid_reading = avg_reading
        log_message("success", f"Stable reading calculated from {len(valid_readings)} samples", avg_reading)
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
            log_message("success", "Already connected to WiFi")
            return True
        
        log_message("system", f"Connecting to WiFi: {self.ssid}")
        self.wlan.active(True)
        
        for attempt in range(MAX_RETRIES):
            try:
                log_message("info", f"WiFi connection attempt {attempt + 1}/{MAX_RETRIES}")
                self.wlan.connect(self.ssid, self.password)
                
                start_time = time.ticks_ms()
                while not self.wlan.isconnected():
                    if time.ticks_diff(time.ticks_ms(), start_time) > CONNECTION_TIMEOUT * 1000:
                        log_message("warning", f"WiFi timeout on attempt {attempt + 1}")
                        break
                    blink_led(1, 0.1)
                    time.sleep(0.5)
                
                if self.wlan.isconnected():
                    config = self.wlan.ifconfig()
                    log_message("success", f"WiFi connected! IP: {config[0]}", {
                        "ip": config[0],
                        "gateway": config[2],
                        "dns": config[3]
                    })
                    blink_led(3, 0.1)
                    return True
                    
            except Exception as e:
                log_message("error", f"WiFi error on attempt {attempt + 1}: {e}")
            
            if attempt < MAX_RETRIES - 1:
                log_message("info", "Retrying WiFi connection in 3 seconds...")
                time.sleep(3)
        
        log_message("error", "Failed to connect to WiFi after all attempts")
        blink_led(10, 0.2)
        return False
    
    def is_connected(self):
        """Verifica se connesso al WiFi."""
        return self.wlan.isconnected()
    
    def get_signal_info(self):
        """Ottiene informazioni sul segnale."""
        if not self.is_connected():
            return None
        try:
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
        
    def send_data(self, payload, send_reason="change"):
        """Invia dati al server."""
        if not payload:
            log_message("warning", "No payload to send")
            return False
        
        payload_with_reason = payload.copy()
        payload_with_reason["send_reason"] = send_reason
        payload_with_reason["timestamp"] = get_current_timestamp()
        
        log_message("info", f"Sending data ({send_reason})", payload_with_reason)
        
        for attempt in range(MAX_RETRIES):
            try:
                log_message("info", f"HTTP POST attempt {attempt + 1}/{MAX_RETRIES}")
                
                response = urequests.post(
                    self.url,
                    json=payload_with_reason,
                    headers=self.headers
                )
                
                log_message("info", f"HTTP Status: {response.status_code}")
                
                try:
                    response_text = response.text[:200]
                    log_message("info", f"Server response: {response_text}")
                except:
                    log_message("info", "Could not read response")
                
                if response.status_code in [200, 201]:
                    log_message("success", "Data sent successfully to server")
                    response.close()
                    self.successful_sends += 1
                    blink_led(1, 0.05)
                    return True
                else:
                    log_message("error", f"Server error: {response.status_code}")
                    
                response.close()
                
            except Exception as e:
                error_msg = str(e)
                log_message("error", f"Send error (attempt {attempt + 1}): {error_msg}")
                
                if "ECONNRESET" in error_msg:
                    log_message("warning", "Connection reset by server")
                elif "ETIMEDOUT" in error_msg:
                    log_message("warning", "Connection timeout")
                elif "ENOTCONN" in error_msg:
                    log_message("warning", "Not connected to server")
            
            if attempt < MAX_RETRIES - 1:
                log_message("info", "Retrying in 2 seconds...")
                time.sleep(2)
        
        log_message("error", "Failed to send data after all attempts")
        self.failed_sends += 1
        blink_led(2, 0.3)
        return False
    
    def get_stats(self):
        """Ritorna statistiche di invio."""
        total = max(1, self.successful_sends + self.failed_sends)
        return {
            "successful": self.successful_sends,
            "failed": self.failed_sends,
            "success_rate": round(self.successful_sends / total * 100, 2)
        }

def calculate_air_quality(smoke, lpg, methane, hydrogen):
    """Calcola l'indice di qualita dell'aria."""
    try:
        thresholds = {
            'smoke': [30, 100, 250, 400],
            'lpg': [15, 40, 80, 150],
            'methane': [10, 30, 70, 120],
            'hydrogen': [8, 20, 50, 90]
        }
        
        def get_level(value, limits):
            level = 1
            for threshold in limits:
                if value > threshold:
                    level += 1
            return min(level, 5)
        
        levels = [
            get_level(smoke, thresholds['smoke']),
            get_level(lpg, thresholds['lpg']),
            get_level(methane, thresholds['methane']),
            get_level(hydrogen, thresholds['hydrogen'])
        ]
        
        avg_level = sum(levels) / len(levels)
        
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
        
        log_message("sensor", f"AQI calculated: {aqi} ({description})", {
            "gas_levels": levels,
            "avg_level": round(avg_level, 2),
            "aqi": aqi,
            "description": description
        })
        
        return float(aqi), description
        
    except Exception as e:
        log_message("error", f"Error calculating AQI: {e}")
        return 50.0, "Unknown"

def should_send_data(current_data, last_sent_data):
    """Determina se i dati sono cambiati abbastanza da essere inviati."""
    if not last_sent_data:
        return True
    
    thresholds = {
        'smoke': 5.0,
        'lpg': 3.0,
        'methane': 3.0,
        'hydrogen': 2.0,
        'air_quality_index': 2.0
    }
    
    for key, threshold in thresholds.items():
        old_val = last_sent_data.get(key, 0)
        new_val = current_data.get(key, 0)
        if abs(new_val - old_val) > threshold:
            log_message("info", f"Significant change detected in {key}: {old_val} -> {new_val}")
            return True
    
    return False

def time_until_next_hour():
    """Calcola i secondi rimanenti fino alla prossima ora."""
    current_time = time.time()
    current_local = time.localtime(current_time)
    seconds_in_hour = current_local[4] * 60 + current_local[5]
    seconds_remaining = 3600 - seconds_in_hour
    return seconds_remaining

def format_time_remaining(seconds):
    """Formatta i secondi rimanenti in formato mm:ss."""
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes:02d}:{secs:02d}"

def main():
    """Funzione principale."""
    global websocket_connected
    
    log_message("system", "Air Quality Monitor - Pico W Starting...")
    log_message("system", f"Sensor interval: {SENSOR_READ_INTERVAL}s")
    log_message("system", f"Hourly send interval: {HOURLY_SEND_INTERVAL}s")
    log_message("system", f"Server URL: {URL}")
    
    status_led.off()
    
    try:
        log_message("system", "Initializing WiFi...")
        wifi = WiFiManager(SSID, PASSWORD)
        
        log_message("system", "Initializing Sensor...")
        sensor_manager = SensorManager()
        
        log_message("system", "Initializing Data Sender...")
        data_sender = DataSender(URL, HEADERS)
        
    except Exception as e:
        log_message("error", f"Initialization failed: {e}")
        blink_led(20, 0.1)
        return
    
    if not wifi.connect():
        log_message("error", "Cannot start without WiFi")
        return
    
    connect_websocket()
    
    start_time = get_current_timestamp()
    last_hourly_send = start_time
    
    seconds_to_next_hour = time_until_next_hour()
    next_hourly_send = start_time + seconds_to_next_hour
    
    log_message("system", f"Current time: {format_timestamp(start_time)}")
    log_message("system", f"Next hourly send in: {format_time_remaining(seconds_to_next_hour)}")
    log_message("success", "Starting main monitoring loop...")
    
    cycle_count = 0
    consecutive_errors = 0
    max_consecutive_errors = 5
    last_sent_data = None
    last_change_send = start_time
    websocket_retry_time = 0
    
    while True:
        try:
            cycle_count += 1
            current_time = get_current_timestamp()
            
            log_message("info", f"--- Cycle {cycle_count} ({format_timestamp(current_time)}) ---")
            
            if not websocket_connected and current_time > websocket_retry_time:
                log_message("system", "Attempting WebSocket reconnection...")
                if connect_websocket():
                    websocket_retry_time = 0
                else:
                    websocket_retry_time = current_time + WEBSOCKET_RETRY_DELAY
                    log_message("info", f"WebSocket retry scheduled in {WEBSOCKET_RETRY_DELAY}s")
            
            if not wifi.is_connected():
                log_message("warning", "WiFi disconnected, reconnecting...")
                if not wifi.connect():
                    log_message("error", "WiFi reconnection failed, waiting...")
                    time.sleep(10)
                    continue
            
            log_message("sensor", "Reading sensors...")
            sensor_data = sensor_manager.get_stable_reading()
            
            if not sensor_data:
                log_message("error", "No valid sensor data")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log_message("error", "Too many sensor errors, restarting...")
                    time.sleep(5)
                    reset()
                time.sleep(5)
                continue
            
            consecutive_errors = 0
            
            aqi, description = calculate_air_quality(
                sensor_data['smoke'],
                sensor_data['lpg'],
                sensor_data['methane'],
                sensor_data['hydrogen']
            )
            
            current_data = {
                "smoke": sensor_data['smoke'],
                "lpg": sensor_data['lpg'],
                "methane": sensor_data['methane'],
                "hydrogen": sensor_data['hydrogen'],
                "air_quality_index": aqi,
                "air_quality_description": description
            }
            
            time_since_hourly = current_time - last_hourly_send
            is_hourly_time = time_since_hourly >= HOURLY_SEND_INTERVAL
            has_significant_change = should_send_data(current_data, last_sent_data)
            time_to_next_hourly = HOURLY_SEND_INTERVAL - time_since_hourly
            
            if is_hourly_time:
                log_message("system", "Hourly send time reached!")
                if data_sender.send_data(current_data, "hourly"):
                    last_hourly_send = current_time
                    last_sent_data = current_data.copy()
                    log_message("success", "Hourly data sent and cached")
                else:
                    log_message("error", "Hourly data send failed")
                    
            elif has_significant_change:
                log_message("info", "Significant change detected!")
                if data_sender.send_data(current_data, "change"):
                    last_change_send = current_time
                    last_sent_data = current_data.copy()
                    log_message("success", "Change data sent and cached")
                else:
                    log_message("error", "Change data send failed")
                    
            else:
                log_message("info", "No significant change, monitoring continues...")
                log_message("info", f"Time until next hourly send: {format_time_remaining(int(time_to_next_hourly))}")
            
            if cycle_count % 10 == 0:
                stats = data_sender.get_stats()
                log_message("system", f"Stats after {cycle_count} cycles", {
                    "success_rate": f"{stats['success_rate']}%",
                    "successful": stats['successful'],
                    "failed": stats['failed'],
                    "websocket": "connected" if websocket_connected else "disconnected"
                })
                
                log_message("system", f"Last hourly send: {format_timestamp(last_hourly_send)}")
                if last_sent_data:
                    log_message("system", f"Last change send: {format_timestamp(last_change_send)}")
                print_memory_info()
            
            gc.collect()
            
            log_message("info", f"Waiting {SENSOR_READ_INTERVAL}s until next cycle...")
            time.sleep(SENSOR_READ_INTERVAL)
            
        except KeyboardInterrupt:
            log_message("system", "Program interrupted by user")
            break
        except Exception as e:
            log_message("error", f"Unexpected error in main loop: {e}")
            consecutive_errors += 1
            if consecutive_errors >= max_consecutive_errors:
                log_message("error", "Too many consecutive errors, restarting device...")
                time.sleep(5)
                reset()
            time.sleep(10)
    
    log_message("system", "Air Quality Monitor stopped")
    disconnect_websocket()
    status_led.off()

def watchdog():
    """Watchdog semplice per reset in caso di blocco."""
    start_time = time.ticks_ms()
    while True:
        time.sleep(300)
        if time.ticks_diff(time.ticks_ms(), start_time) > 600000:
            log_message("error", "Watchdog timeout - resetting...")
            reset()

if __name__ == "__main__":
    log_message("system", "Starting Air Quality Monitor with WebSocket Logs...")
    
    for i in range(3):
        status_led.on()
        time.sleep(0.2)
        status_led.off()
        time.sleep(0.2)
    
    try:
        main()
    except Exception as e:
        log_message("error", f"Fatal error: {e}")
        log_message("system", "Restarting in 10 seconds...")
        blink_led(50, 0.1)
        time.sleep(10)
        reset()
