import network
import time
import urequests
import gc
import json
from mq2 import MQ2
from machine import Pin, ADC, reset, RTC
import _thread
import sys

# Wi-Fi credentials
SSID = 'uaifi'
PASSWORD = 'jasap-colleferro-enrico-2020-!@'

# Server settings
BASE_URL = "http://192.168.178.101:5000"
AIR_QUALITY_URL = f"{BASE_URL}/api/air_quality"
PICO_LOGS_URL = f"{BASE_URL}/api/pico-logs"
HEADERS = {"Content-Type": "application/json"}

# Configurazioni
MAX_RETRIES = 3
SENSOR_READ_INTERVAL = 30
CONNECTION_TIMEOUT = 15
SEND_TIMEOUT = 10
READINGS_FOR_AVERAGE = 3
HOURLY_SEND_INTERVAL = 3600
LOG_BATCH_SIZE = 5
LOG_SEND_INTERVAL = 60  # Invia log ogni 60 secondi

# LED di stato
try:
    status_led = Pin("LED", Pin.OUT)
except:
    status_led = Pin(25, Pin.OUT)

# Log state
log_queue = []
MAX_LOG_QUEUE = 50
last_log_send = 0


class PicoLogger:
    """Gestisce l'invio di log via HTTP al Flask backend."""
    
    def __init__(self, server_url, device_id="pico-w-001"):
        self.server_url = server_url
        self.device_id = device_id
        self.pending_logs = []
        self.successful_sends = 0
        self.failed_sends = 0

    def add_log(self, level, message, sensor_data=None):
        """Aggiunge un log alla coda per l'invio batch."""
        log_entry = {
            "level": level,
            "message": message,
            "sensor_data": sensor_data or {},
            "device_id": self.device_id,
            "timestamp": time.time()
        }
        
        self.pending_logs.append(log_entry)
        
        # Se la coda è piena, invia immediatamente
        if len(self.pending_logs) >= LOG_BATCH_SIZE:
            self.send_pending_logs()

    def send_pending_logs(self):
        """Invia tutti i log in coda al server Flask."""
        if not self.pending_logs:
            return True
            
        try:
            # Per ora invia i log uno per volta dato che l'endpoint Flask
            # sembra essere progettato per singoli log
            success_count = 0
            
            for log_entry in self.pending_logs[:]:
                try:
                    response = urequests.post(
                        f"{self.server_url}/api/pico-logs",
                        json=log_entry,
                        headers=HEADERS
                    )
                    
                    if response.status_code in [200, 201]:
                        success_count += 1
                        self.successful_sends += 1
                    else:
                        print(f"[LOG SEND ERROR] HTTP {response.status_code}")
                        self.failed_sends += 1
                    
                    response.close()
                    
                except Exception as e:
                    print(f"[LOG SEND ERROR] {e}")
                    self.failed_sends += 1
            
            # Pulisce la coda
            sent_logs = len(self.pending_logs)
            self.pending_logs.clear()
            
            if success_count > 0:
                print(f"[LOG SUCCESS] Sent {success_count}/{sent_logs} logs to server")
            
            return success_count > 0
            
        except Exception as e:
            print(f"[LOG BATCH ERROR] {e}")
            self.failed_sends += len(self.pending_logs)
            return False

    def send_immediate_log(self, level, message, sensor_data=None):
        """Invia un log immediatamente (per messaggi critici)."""
        log_entry = {
            "level": level,
            "message": message,
            "sensor_data": sensor_data or {},
            "device_id": self.device_id,
            "timestamp": time.time()
        }
        
        try:
            response = urequests.post(
                f"{self.server_url}/api/pico-logs",
                json=log_entry,
                headers=HEADERS
            )
            
            success = response.status_code in [200, 201]
            if success:
                self.successful_sends += 1
            else:
                self.failed_sends += 1
                
            response.close()
            return success
            
        except Exception as e:
            print(f"[IMMEDIATE LOG ERROR] {e}")
            self.failed_sends += 1
            return False

    def get_stats(self):
        """Ritorna statistiche di invio log."""
        total = max(1, self.successful_sends + self.failed_sends)
        return {
            "successful": self.successful_sends,
            "failed": self.failed_sends,
            "success_rate": round(self.successful_sends / total * 100, 2),
            "pending": len(self.pending_logs)
        }


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


# Inizializza logger HTTP
pico_logger = PicoLogger(BASE_URL)


def log_message(level, message, data=None, immediate=False):
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

    # Invia log al server
    if immediate or level in ["error", "critical"]:
        # Invia immediatamente per log critici
        pico_logger.send_immediate_log(level, message, data)
    else:
        # Aggiungi alla coda per invio batch
        pico_logger.add_log(level, message, data)


def send_pending_logs_if_needed():
    """Invia i log in coda se è il momento."""
    global last_log_send
    
    current_time = get_current_timestamp()
    if current_time - last_log_send >= LOG_SEND_INTERVAL:
        if pico_logger.send_pending_logs():
            last_log_send = current_time


class SensorManager:
    """Gestisce la lettura e calibrazione del sensore MQ2."""
    
    def __init__(self, pin_data=26, base_voltage=3.3):
        """Inizializza il manager del sensore MQ2."""
        log_message("system", "Initializing MQ2 sensor...")
        try:
            self.sensor = MQ2(pinData=pin_data, baseVoltage=base_voltage)
            log_message("system", "Starting sensor calibration...")
            self.sensor.calibrate()
            log_message("success", "Sensor calibrated successfully", immediate=True)
            blink_led(2, 0.1)
        except Exception as e:
            log_message("error", f"Sensor initialization failed: {e}", immediate=True)
            blink_led(5, 0.5)
            raise
        
        self.last_valid_reading = None
        
    def read_sensor_raw(self):
        """Legge i valori grezzi dal sensore."""
        try:
            return {
                'smoke': self.sensor.readSmoke(),
                'lpg': self.sensor.readLPG(),
                'methane': self.sensor.readMethane(),
                'hydrogen': self.sensor.readHydrogen()
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
        """Ottiene una lettura stabile mediando più misurazioni."""
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
    """Gestisce la connessione WiFi."""
    
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
                    }, immediate=True)
                    blink_led(3, 0.1)
                    return True
                    
            except Exception as e:
                log_message("error", f"WiFi error on attempt {attempt + 1}: {e}")
            
            if attempt < MAX_RETRIES - 1:
                log_message("info", "Retrying WiFi connection in 3 seconds...")
                time.sleep(3)
        
        log_message("error", "Failed to connect to WiFi after all attempts", immediate=True)
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
    """Gestisce l'invio dei dati al server."""
    
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
        
        log_message("info", f"Sending air quality data ({send_reason})", payload_with_reason)
        
        for attempt in range(MAX_RETRIES):
            try:
                log_message("info", f"HTTP POST attempt {attempt + 1}/{MAX_RETRIES}")
                
                response = urequests.post(
                    self.url,
                    json=payload_with_reason,
                    headers=self.headers
                )
                
                log_message("info", f"Air quality HTTP Status: {response.status_code}")
                
                try:
                    response_text = response.text[:200]
                    log_message("info", f"Server response: {response_text}")
                except:
                    log_message("info", "Could not read response")
                
                if response.status_code in [200, 201]:
                    log_message("success", "Air quality data sent successfully to server")
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
        
        log_message("error", "Failed to send air quality data after all attempts")
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
    """Calcola l'indice di qualità dell'aria."""
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
    global last_log_send
    
    log_message("system", "Air Quality Monitor - Pico W Starting...", immediate=True)
    log_message("system", f"Sensor interval: {SENSOR_READ_INTERVAL}s")
    log_message("system", f"Hourly send interval: {HOURLY_SEND_INTERVAL}s")
    log_message("system", f"Air Quality URL: {AIR_QUALITY_URL}")
    log_message("system", f"Pico Logs URL: {PICO_LOGS_URL}")
    
    status_led.off()
    last_log_send = get_current_timestamp()
    
    try:
        log_message("system", "Initializing WiFi...")
        wifi = WiFiManager(SSID, PASSWORD)
        
        log_message("system", "Initializing Sensor...")
        sensor_manager = SensorManager()
        
        log_message("system", "Initializing Data Sender...")
        data_sender = DataSender(AIR_QUALITY_URL, HEADERS)
        
    except Exception as e:
        log_message("error", f"Initialization failed: {e}", immediate=True)
        blink_led(20, 0.1)
        return
    
    if not wifi.connect():
        log_message("error", "Cannot start without WiFi", immediate=True)
        return
    
    start_time = get_current_timestamp()
    last_hourly_send = start_time
    
    seconds_to_next_hour = time_until_next_hour()
    next_hourly_send = start_time + seconds_to_next_hour
    
    log_message("system", f"Current time: {format_timestamp(start_time)}")
    log_message("system", f"Next hourly send in: {format_time_remaining(seconds_to_next_hour)}")
    log_message("success", "Starting main monitoring loop...", immediate=True)
    
    cycle_count = 0
    consecutive_errors = 0
    max_consecutive_errors = 5
    last_sent_data = None
    last_change_send = start_time
    
    while True:
        try:
            cycle_count += 1
            current_time = get_current_timestamp()
            
            log_message("info", f"--- Cycle {cycle_count} ({format_timestamp(current_time)}) ---")
            
            # Invia log in coda se necessario
            send_pending_logs_if_needed()
            
            if not wifi.is_connected():
                log_message("warning", "WiFi disconnected, reconnecting...", immediate=True)
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
                    log_message("error", "Too many sensor errors, restarting...", immediate=True)
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
                log_stats = pico_logger.get_stats()
                log_message("system", f"Stats after {cycle_count} cycles", {
                    "air_quality_success_rate": f"{stats['success_rate']}%",
                    "air_quality_successful": stats['successful'],
                    "air_quality_failed": stats['failed'],
                    "log_success_rate": f"{log_stats['success_rate']}%",
                    "log_successful": log_stats['successful'],
                    "log_failed": log_stats['failed'],
                    "log_pending": log_stats['pending']
                })
                
                log_message("system", f"Last hourly send: {format_timestamp(last_hourly_send)}")
                if last_sent_data:
                    log_message("system", f"Last change send: {format_timestamp(last_change_send)}")
                print_memory_info()
            
            gc.collect()
            
            log_message("info", f"Waiting {SENSOR_READ_INTERVAL}s until next cycle...")
            time.sleep(SENSOR_READ_INTERVAL)
            
        except KeyboardInterrupt:
            log_message("system", "Program interrupted by user", immediate=True)
            break
        except Exception as e:
            log_message("error", f"Unexpected error in main loop: {e}", immediate=True)
            consecutive_errors += 1
            if consecutive_errors >= max_consecutive_errors:
                log_message("error", "Too many consecutive errors, restarting device...", immediate=True)
                time.sleep(5)
                reset()
            time.sleep(10)
    
    # Invia eventuali log rimanenti prima di fermarsi
    log_message("system", "Air Quality Monitor stopping - sending final logs...", immediate=True)
    pico_logger.send_pending_logs()
    status_led.off()


def watchdog():
    """Watchdog semplice per reset in caso di blocco."""
    start_time = time.ticks_ms()
    while True:
        time.sleep(300)
        if time.ticks_diff(time.ticks_ms(), start_time) > 600000:
            log_message("error", "Watchdog timeout - resetting...", immediate=True)
            reset()


if __name__ == "__main__":
    log_message("system", "Starting Air Quality Monitor with HTTP Logs...", immediate=True)
    
    for i in range(3):
        status_led.on()
        time.sleep(0.2)
        status_led.off()
        time.sleep(0.2)
    
    try:
        main()
    except Exception as e:
        log_message("error", f"Fatal error: {e}", immediate=True)
        log_message("system", "Restarting in 10 seconds...", immediate=True)
        blink_led(50, 0.1)
        time.sleep(10)
        reset()
