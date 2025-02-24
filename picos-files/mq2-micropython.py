import network
import time
import urequests
import gc
from mq2 import MQ2
from time import gmtime, localtime, mktime
from datetime import datetime

# Wi-Fi credentials
SSID = ''
PASSWORD = ''

# Server settings
URL = "http://192.168.178.154:5000/api/air_quality"
HEADERS = {"Content-Type": "application/json"}

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    if not wlan.isconnected():
        wlan.active(True)
        wlan.connect(SSID, PASSWORD)
        print("Connecting to Wi-Fi...")
        while not wlan.isconnected():
            time.sleep(1)
    print("Connected to Wi-Fi, IP:", wlan.ifconfig()[0])

def get_timestamp():
    t = gmtime()
    is_dst = 3 <= t[1] <= 10
    time_offset = 2 if is_dst else 1
    t_local = localtime(mktime(t) + time_offset * 3600)

    return "{}, {:02d} {:3s} {:04d} {:02d}:{:02d}:{:02d} CET".format(
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t_local[6]],
        t_local[2], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t_local[1]-1],
        t_local[0], t_local[3], t_local[4], t_local[5]
    )

def calculate_air_quality(smoke, lpg, methane, hydrogen):
    thresholds = {
        'smoke': [50, 150, 300],
        'lpg': [20, 50, 100],
        'methane': [15, 40, 80],
        'hydrogen': [10, 25, 60]
    }

    def get_gas_score(value, limits):
        return sum(value > limit for limit in limits) + 1

    scores = [
        get_gas_score(smoke, thresholds['smoke']),
        get_gas_score(lpg, thresholds['lpg']),
        get_gas_score(methane, thresholds['methane']),
        get_gas_score(hydrogen, thresholds['hydrogen'])
    ]

    avg_score = sum(scores) / 4

    if avg_score <= 1.5:
        return 100, "Good"
    elif avg_score <= 2.5:
        return 75, "Moderate"
    elif avg_score <= 3.5:
        return 50, "Poor"
    return 25, "Very Poor"

def send_data(payload):
    try:
        print("Sending data:", payload)
        response = urequests.post(URL, json=payload, headers=HEADERS)
        print("HTTP Status Code:", response.status_code)
        if response.status_code == 200:
            print("Data sent successfully")
        response.close()
    except Exception as e:
        print("Error sending data:", e)

def main():
    connect_wifi()

    sensor = MQ2(pinData=26, baseVoltage=3.3)
    sensor.calibrate()

    prev_values = (-1, -1, -1, -1)

    while True:
        values = (
            sensor.readSmoke(),
            sensor.readLPG(),
            sensor.readMethane(),
            sensor.readHydrogen()
        )

        if None in values:
            print("Invalid sensor readings. Retrying...")
            time.sleep(2)
            continue

        if values == prev_values:
            print("No change in sensor values. Skipping data send.")
            print("Old value:", prev_values, "Timestamp:", get_timestamp())
        else:
            air_quality_index, air_quality_description = calculate_air_quality(*values)

            payload = {
                "smoke": values[0],
                "lpg": values[1],
                "methane": values[2],
                "hydrogen": values[3],
                "air_quality_index": air_quality_index,
                "air_quality_description": air_quality_description,
                "timestamp": get_timestamp()
            }

            send_data(payload)
            prev_values = values

        gc.collect()
        time.sleep(2)

main()

