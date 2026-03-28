import network
import time
import urequests
import gc
from mq2 import MQ2
from machine import Pin, reset

# ===== Config =====
SSID = "uaifi"
PASSWORD = "jasap-colleferro-enrico-2020-!@"
DEVICE_ID = "pico-w-001"

BASE_URL = "http://192.168.178.101:8888"
AIR_QUALITY_URL = BASE_URL + "/api/air_quality"
PICO_LOGS_URL   = BASE_URL + "/api/pico-logs"

HEADERS = {"Content-Type": "application/json"}

SENSOR_READ_INTERVAL = 30
LOG_BATCH_SIZE       = 3
LOG_SEND_INTERVAL    = 60

# ===== LED =====
try:
    status_led = Pin("LED", Pin.OUT)
except:
    status_led = Pin(25, Pin.OUT)

# ===== HTTP =====
def post(url, data):
    try:
        r = urequests.post(url, json=data, headers=HEADERS)
        code = r.status_code
        r.close()
        return code
    except Exception as e:
        print("[POST ERROR]", e)
        return None

# ===== LED =====
def blink(times=1, delay=0.2):
    for _ in range(times):
        status_led.on();  time.sleep(delay)
        status_led.off(); time.sleep(delay)

# ===== Logger =====
log_queue = []

def sanitize(s):
    """Rimuove caratteri non-ASCII che rompono il JSON su MicroPython."""
    return ''.join(c if ord(c) < 128 else '?' for c in str(s))

def log(level, message, data=None):
    global log_queue
    ts = time.localtime()
    timestamp = "{:04d}-{:02d}-{:02d}T{:02d}:{:02d}:{:02d}".format(
        ts[0], ts[1], ts[2], ts[3], ts[4], ts[5])
    entry = {
        "level":       level,
        "message":     sanitize(message),
        "device_id":   DEVICE_ID,
        "timestamp":   timestamp,
        "sensor_data": {}
    }
    log_queue.append(entry)
    if len(log_queue) > 50:
        log_queue = log_queue[-50:]
    print("[{}] [{}] {}".format(timestamp, level.upper(), message))
    if data:
        print("    ", data)

def send_logs():
    global log_queue
    if not log_queue:
        return
    batch = log_queue[:LOG_BATCH_SIZE]
    sent  = 0
    for entry in batch:
        code = post(PICO_LOGS_URL, entry)
        if code in (200, 201):
            sent += 1
        else:
            print("[LOG] send failed, code =", code)
            break
    log_queue = log_queue[sent:]
    print("[LOG] sent {}/{} logs, {} remaining".format(sent, len(batch), len(log_queue)))

# ===== WiFi =====
class WiFiManager:
    def __init__(self):
        self.wlan = network.WLAN(network.STA_IF)

    def connect(self):
        self.wlan.active(True)
        if self.wlan.isconnected():
            return True
        print("[WIFI] Connecting to", SSID)
        self.wlan.connect(SSID, PASSWORD)
        start = time.time()
        while not self.wlan.isconnected():
            if time.time() - start > 15:
                return False
            blink(1, 0.1)
            time.sleep(0.5)
        ip = self.wlan.ifconfig()[0]
        print("[WIFI] Connected, IP:", ip)
        return True

    def is_connected(self):
        return self.wlan.isconnected()

    def reconnect(self):
        print("[WIFI] Reconnecting...")
        self.wlan.disconnect()
        time.sleep(1)
        return self.connect()

# ===== Sensor =====
class SensorManager:
    def __init__(self, pin=26):
        log("system", "Calibrating MQ2 sensor...")
        self.sensor = MQ2(pinData=pin)
        self.sensor.calibrate()
        self.last_valid = None
        blink(2, 0.1)
        log("success", "Sensor ready")

    def read_stable(self, samples=3):
        readings = []
        for _ in range(samples * 2):
            try:
                r = {
                    "smoke":    self.sensor.readSmoke(),
                    "lpg":      self.sensor.readLPG(),
                    "methane":  self.sensor.readMethane(),
                    "hydrogen": self.sensor.readHydrogen()
                }
                if all(isinstance(v, (int, float)) and 0 <= v <= 5000
                       for v in r.values()):
                    readings.append(r)
            except Exception as e:
                print("[SENSOR ERROR]", e)
            if len(readings) >= samples:
                break
            time.sleep(0.5)

        if not readings:
            log("error", "No valid sensor readings")
            return self.last_valid

        avg = {k: round(sum(r[k] for r in readings) / len(readings), 2)
               for k in readings[0]}
        self.last_valid = avg
        return avg

# ===== AQI =====
def calculate_aqi(data):
    thresholds = {
        "smoke":    [30, 100, 250, 400],
        "lpg":      [15,  40,  80, 150],
        "methane":  [10,  30,  70, 120],
        "hydrogen": [ 8,  20,  50,  90]
    }
    levels = []
    for gas, limits in thresholds.items():
        lvl = 1
        for t in limits:
            if data[gas] > t:
                lvl += 1
        levels.append(min(lvl, 5))

    avg = sum(levels) / len(levels)

    if avg <= 1.5:
        aqi, desc = 95 - (avg - 1) * 10,           "Good"
    elif avg <= 2.5:
        aqi, desc = 85 - (avg - 1.5) * 15,         "Moderate"
    elif avg <= 3.5:
        aqi, desc = 70 - (avg - 2.5) * 20,         "Poor"
    elif avg <= 4.5:
        aqi, desc = 50 - (avg - 3.5) * 25,         "Very Poor"
    else:
        aqi, desc = max(25 - (avg - 4.5) * 25, 0), "Hazardous"

    return round(aqi, 1), desc

# ===== Data changed? =====
def has_changed(current, last):
    if not last:
        return True
    thresholds = {
        "smoke": 5, "lpg": 3, "methane": 3,
        "hydrogen": 2, "air_quality_index": 2
    }
    for k, t in thresholds.items():
        if abs(current.get(k, 0) - last.get(k, 0)) > t:
            return True
    return False

# ===== Main =====
def main():
    blink(3, 0.15)

    wifi = WiFiManager()
    if not wifi.connect():
        log("error", "WiFi failed, restarting in 10s")
        send_logs()
        time.sleep(10)
        reset()

    log("system", "WiFi ok - booting sensor")
    send_logs()

    sensor             = SensorManager()
    last_sent          = None
    last_log_send_time = time.time()
    cycle              = 0

    log("success", "Main loop starting")
    send_logs()

    while True:
        cycle += 1
        log("info", "Cycle {}".format(cycle))

        # WiFi check
        if not wifi.is_connected():
            log("warning", "WiFi lost, reconnecting")
            if not wifi.reconnect():
                log("error", "Reconnect failed, restarting")
                send_logs()
                time.sleep(5)
                reset()

        # Read sensor
        data = sensor.read_stable()
        if not data:
            log("error", "Sensor read failed, skipping cycle")
            time.sleep(5)
            continue

        aqi, desc = calculate_aqi(data)
        data["air_quality_index"]       = aqi
        data["air_quality_description"] = desc

        log("sensor", "AQI={} ({})".format(aqi, desc))

        # Send air quality data if changed
        if has_changed(data, last_sent):
            payload = data.copy()
            payload["send_reason"] = "change"
            payload["timestamp"]   = time.time()
            code = post(AIR_QUALITY_URL, payload)
            if code in (200, 201):
                log("success", "Air quality sent")
                last_sent = data.copy()
                blink(1, 0.05)
            else:
                log("error", "Air quality send failed, code={}".format(code))

        # Send logs batch every LOG_SEND_INTERVAL seconds
        if time.time() - last_log_send_time >= LOG_SEND_INTERVAL:
            send_logs()
            last_log_send_time = time.time()

        gc.collect()
        time.sleep(SENSOR_READ_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("[FATAL]", e)
        time.sleep(10)
        reset()
