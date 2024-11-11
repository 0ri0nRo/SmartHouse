import network
import time
import urequests  # Import the library to make HTTP requests in MicroPython
from machine import Pin
from datetime import datetime
from mq2 import MQ2  # Import the MQ2 class
import utime

# Wi-Fi credentials
ssid = ""
password = ""

# Function to connect to Wi-Fi
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)
    print("Connecting to Wi-Fi...")
    while not wlan.isconnected():
        time.sleep(1)
    print("Connected to Wi-Fi")
    print("IP Address:", wlan.ifconfig()[0])

from time import gmtime, localtime, mktime
from datetime import datetime

# Function to get the timestamp in local Rome time (CET/CEST)
def get_timestamp():
    # Get the current UTC time
    t = gmtime()
    
    # Apply the time zone offset for Rome (UTC +1 for CET or UTC +2 for CEST)
    current_month = t[1]
    is_dst = (3 <= current_month <= 10)  # Daylight Saving Time is between March and October in Rome
    
    # Rome's timezone offset: UTC +2 during DST (CEST), UTC +1 otherwise (CET)
    time_offset = 2 if is_dst else 1
    t_local = localtime(mktime(t) + time_offset * 3600)  # Apply time offset in seconds

    # Format the timestamp for local time in Rome
    timestamp = "{}, {:02d} {:3s} {:04d} {:02d}:{:02d}:{:02d} CET".format(
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t_local[6]],
        t_local[2], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t_local[1]-1],
        t_local[0], t_local[3], t_local[4], t_local[5]
    )
    return timestamp

# Function to calculate the general air quality based on gas values (equal weighting)
def calculate_air_quality(smoke_value, lpg_value, methane_value, hydrogen_value):
    
    # Adjusted thresholds based on typical use cases for an MQ2 sensor
    smoke_thresholds = [50, 150, 300]  # Example values in PPM or appropriate unit
    lpg_thresholds = [20, 50, 100]
    methane_thresholds = [15, 40, 80]
    hydrogen_thresholds = [10, 25, 60]

    # Function to get the gas score based on the thresholds
    def get_gas_score(value, thresholds):
        if value <= thresholds[0]:
            return 1  # Good
        elif value <= thresholds[1]:
            return 2  # Moderate
        elif value <= thresholds[2]:
            return 3  # Poor
        else:
            return 4  # Very Poor

    # Get the score for each gas
    smoke_score = get_gas_score(smoke_value, smoke_thresholds)
    lpg_score = get_gas_score(lpg_value, lpg_thresholds)
    methane_score = get_gas_score(methane_value, methane_thresholds)
    hydrogen_score = get_gas_score(hydrogen_value, hydrogen_thresholds)

    # Calculate the air quality as an average score
    total_score = (smoke_score + lpg_score + methane_score + hydrogen_score) / 4

    # Determine the air quality based on the average score
    if total_score <= 1.5:
        air_quality_index = 100  # Good
        air_quality_description = "Good"
    elif total_score <= 2.5:
        air_quality_index = 75  # Moderate
        air_quality_description = "Moderate"
    elif total_score <= 3.5:
        air_quality_index = 50  # Poor
        air_quality_description = "Poor"
    else:
        air_quality_index = 25  # Very Poor
        air_quality_description = "Very Poor"

    return air_quality_index, air_quality_description

# Function to send the data to the server via POST
def send_data(payload):
    url = "my/secret/route/"  # Server URL
    headers = {"Content-Type": "application/json"}  # Headers for JSON content
    try:
        print(f"Sending data: {payload}")
        response = urequests.post(url, json=payload, headers=headers)  # Send the POST request
        print(f"HTTP Status Code: {response.status_code}")  # Print the HTTP status code
        print("Response:", response.text)  # Print the response from the server
        if response.status_code == 200:
            print("Data sent to server successfully")
        else:
            print("Failed to send data to server")
    except Exception as e:
        print("Error sending data:", e)

# Main function
def main():
    connect_wifi()  # Connect to Wi-Fi

    # Initialize the MQ2 sensor on pin 26
    sensor = MQ2(pinData=26, baseVoltage=3.3)
    sensor.calibrate()

    # Variables to store previous values
    previous_values = None

    while True:
        # Read the values for each gas from the MQ2 sensor
        smoke_value = sensor.readSmoke()
        lpg_value = sensor.readLPG()
        methane_value = sensor.readMethane()
        hydrogen_value = sensor.readHydrogen()
        
        # Ensure that the values are not None before calculating
        if None in [smoke_value, lpg_value, methane_value, hydrogen_value]:
            print("Error: One or more sensor values are invalid.")
            continue

        # If the values are the same as the previous ones, skip sending the data
        if previous_values == (smoke_value, lpg_value, methane_value, hydrogen_value):
            print("No change in sensor values. Skipping data send.")
            print(f"Old value: {previous_values}, timestamp: {get_timestamp()}")
        else:
            # Calculate the general air quality
            air_quality_index, air_quality_description = calculate_air_quality(
                smoke_value, lpg_value, methane_value, hydrogen_value
            )

            # Create the payload with all the data
            payload = {
                "smoke": smoke_value,
                "lpg": lpg_value,
                "methane": methane_value,
                "hydrogen": hydrogen_value,
                "air_quality_index": air_quality_index,
                "air_quality_description": air_quality_description,  # Add description
                "timestamp": get_timestamp()
            }

            # Send the payload to the server via POST
            send_data(payload)

            # Store the current values as the previous ones
            previous_values = (smoke_value, lpg_value, methane_value, hydrogen_value)

        time.sleep(2)  # Wait 2 seconds before the next reading

# Start the program
main()

