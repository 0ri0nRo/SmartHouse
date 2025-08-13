"""
Raspberry Pi Pico W Logger Example
This script connects to your Flask WebSocket server and sends logs with sensor data.
"""

import network
import socket
import json
import time
import machine
import urequests
from machine import ADC, Pin
import gc

class PicoLogger:
    def __init__(self, wifi_ssid, wifi_password, server_url):
        self.wifi_ssid = wifi_ssid
        self.wifi_password = wifi_password
        self.server_url = server_url
        self.device_id = "pico-w-001"
        self.wlan = network.WLAN(network.STA_IF)
        
        # Initialize sensors (example)
        self.temp_sensor = ADC(4)  # Built-in temperature sensor
        self.led = Pin("LED", Pin.OUT)
        
        # WebSocket connection (simplified HTTP POST for MicroPython)
        self.connected = False
        
    def connect_wifi(self):
        """Connect to WiFi network"""
        self.wlan.active(True)
        self.wlan.connect(self.wifi_ssid, self.wifi_password)
        
        print("Connecting to WiFi...")
        timeout = 10
        while timeout > 0:
            if self.wlan.status() < 0 or self.wlan.status() >= 3:
                break
            timeout -= 1
            time.sleep(1)
        
        if self.wlan.status() != 3:
            self.log_error("Failed to connect to WiFi")
            return False
        else:
            print(f"Connected to WiFi. IP: {self.wlan.ifconfig()[0]}")
            self.connected = True
            return True
    
    def read_temperature(self):
        """Read temperature from built-in sensor"""
        try:
            # Convert ADC reading to temperature (approximate)
            reading = self.temp_sensor.read_u16() * 3.3 / 65536
            temperature = 27 - (reading - 0.706) / 0.001721
            return round(temperature, 2)
        except Exception as e:
            print(f"Error reading temperature: {e}")
            return None
    
    def send_log(self, level, message, sensor_data=None):
        """Send log to Flask server via HTTP POST (simulating WebSocket)"""
        if not self.connected:
            print(f"Not connected - would log: [{level}] {message}")
            return False
        
        try:
            log_data = {
                "level": level,
                "message": message,
                "sensor_data": sensor_data or {},
                "device_id": self.device_id,
                "timestamp": self.get_timestamp()
            }
            
            # Send to Flask server (you may need to implement actual WebSocket client)
            # For now, using HTTP POST to test endpoint
            response = urequests.post(
                f"{self.server_url}/api/pico-logs/test",
                json=log_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                print(f"Log sent successfully: [{level}] {message}")
                self.led.toggle()  # Indicate successful transmission
                return True
            else:
                print(f"Failed to send log: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Error sending log: {e}")
            return False
        finally:
            try:
                response.close()
            except:
                pass
    
    def get_timestamp(self):
        """Get current timestamp (simplified)"""
        # Note: You might want to implement NTP time sync for accurate timestamps
        import time
        return time.time()
    
    def log_info(self, message, sensor_data=None):
        """Send INFO level log"""
        return self.send_log("INFO", message, sensor_data)
    
    def log_warning(self, message, sensor_data=None):
        """Send WARNING level log"""
        return self.send_log("WARN", message, sensor_data)
    
    def log_error(self, message, sensor_data=None):
        """Send ERROR level log"""
        return self.send_log("ERROR", message, sensor_data)
    
    def log_debug(self, message, sensor_data=None):
        """Send DEBUG level log"""
        return self.send_log("DEBUG", message, sensor_data)
    
    def collect_sensor_data(self):
        """Collect all sensor readings"""
        try:
            temperature = self.read_temperature()
            
            # Add more sensors here as needed
            sensor_data = {
                "temperature_c": temperature,
                "wifi_signal": self.wlan.status(),
                "free_memory": gc.mem_free(),
                "cpu_freq": machine.freq()
            }
            
            return sensor_data
        except Exception as e:
            print(f"Error collecting sensor data: {e}")
            return {}
    
    def run_monitoring_loop(self, interval=30):
        """Main monitoring loop"""
        print(f"Starting monitoring loop (interval: {interval}s)")
        
        while True:
            try:
                # Collect sensor data
                sensor_data = self.collect_sensor_data()
                
                # Send periodic status update
                self.log_info("Periodic sensor reading", sensor_data)
                
                # Check for any alerts
                temp = sensor_data.get("temperature_c")
                if temp and temp > 30:
                    self.log_warning(f"High temperature detected: {temp}°C", sensor_data)
                elif temp and temp < 10:
                    self.log_warning(f"Low temperature detected: {temp}°C", sensor_data)
                
                # Check memory
                free_mem = sensor_data.get("free_memory", 0)
                if free_mem < 10000:  # Less than 10KB free
                    self.log_warning(f"Low memory: {free_mem} bytes free", sensor_data)
                
                time.sleep(interval)
                
            except Exception as e:
                self.log_error(f"Error in monitoring loop: {str(e)}")
                time.sleep(5)  # Short delay before retrying
            
            # Check WiFi connection
            if self.wlan.status() != 3:
                self.connected = False
                print("WiFi disconnected, attempting to reconnect...")
                if self.connect_wifi():
                    self.log_info("WiFi reconnected successfully")

def main():
    """Main function to run the Pico W logger"""
    
    # Configuration - UPDATE THESE VALUES
    WIFI_SSID = "YOUR_WIFI_SSID"
    WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"
    SERVER_URL = "http://YOUR_RASPBERRY_PI_IP:5000"  # Your Flask server
    
    # Create logger instance
    logger = PicoLogger(WIFI_SSID, WIFI_PASSWORD, SERVER_URL)
    
    # Connect to WiFi
    if not logger.connect_wifi():
        print("Failed to connect to WiFi. Stopping.")
        return
    
    # Send startup message
    logger.log_info("Pico W logger started successfully", {
        "device_id": logger.device_id,
        "ip_address": logger.wlan.ifconfig()[0]
    })
    
    try:
        # Run monitoring loop
        logger.run_monitoring_loop(interval=60)  # Send logs every minute
    except KeyboardInterrupt:
        logger.log_info("Pico W logger stopped by user")
        print("Logger stopped")
    except Exception as e:
        logger.log_error(f"Fatal error: {str(e)}")
        print(f"Fatal error: {e}")

if __name__ == "__main__":
    main()


# Alternative WebSocket implementation for more advanced usage
# You would need to implement a WebSocket client library for MicroPython
# or use the above HTTP POST approach which works with the Flask-SocketIO server

"""
Example of how to use this logger in your main.py on Pico W:

1. Save this file as pico_logger.py on your Pico W
2. Update the WiFi credentials and server URL
3. Create a main.py that imports and uses it:

import pico_logger

if __name__ == "__main__":
    pico_logger.main()

Or integrate it into your existing code:

from pico_logger import PicoLogger

logger = PicoLogger("WIFI_SSID", "WIFI_PASS", "http://192.168.1.100:5000")
logger.connect_wifi()
logger.log_info("My sensor reading", {"temperature": 25.6, "humidity": 60.2})
"""