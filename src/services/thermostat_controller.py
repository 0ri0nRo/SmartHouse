import time
import requests
import threading
from datetime import datetime
from typing import Optional

class ThermostatController:
    def __init__(self, sensor_service, check_interval: int = 60):
        """
        Initialize thermostat controller.
        
        Args:
            sensor_service: Instance of SensorService for DB operations
            check_interval: Seconds between temperature checks (default: 60)
        """
        self.sensor_service = sensor_service
        self.check_interval = check_interval
        self.running = False
        self.thread: Optional[threading.Thread] = None
        
        # API endpoints
        self.sensor_api = "https://192.168.178.101:4443/api_sensors"
        self.thermostat_on_api = "http://localhost:5000/api/thermostat/on"
        self.thermostat_off_api = "http://localhost:5000/api/thermostat/off"
        
        # Temperature thresholds
        self.temperature_tolerance = 0.5  # °C tolerance before switching
        
    def get_current_temperature(self) -> Optional[float]:
        """Fetch current temperature from sensor API."""
        try:
            response = requests.get(self.sensor_api, timeout=10, verify=False)
            response.raise_for_status()
            data = response.json()
            
            current_temp = float(data['temperature']['current'])
            print(f"📊 Current temperature: {current_temp}°C")
            return current_temp
            
        except Exception as e:
            print(f"❌ Error fetching temperature: {e}")
            return None
    
    def get_target_temperature(self) -> Optional[float]:
        """Get target temperature from database."""
        try:
            target = self.sensor_service.get_target_temperature()
            print(f"🎯 Target temperature: {target}°C")
            return target
        except Exception as e:
            print(f"❌ Error getting target temperature: {e}")
            return None
    
    def get_boiler_status(self) -> bool:
        """Get current boiler status from database."""
        try:
            return self.sensor_service.get_boiler_status()
        except Exception as e:
            print(f"❌ Error getting boiler status: {e}")
            return False
    
    def turn_boiler_on(self) -> bool:
        """Turn boiler ON via API and update DB."""
        try:
            # Call thermostat ON API (handles Shelly device)
            response = requests.post(self.thermostat_on_api, timeout=10)
            response.raise_for_status()
            
            # Update boiler status in DB
            success = self.sensor_service.set_boiler_status(True)
            
            if success:
                print("✅ Boiler turned ON")
                return True
            else:
                print("⚠️ Boiler API succeeded but DB update failed")
                return False
                
        except Exception as e:
            print(f"❌ Error turning boiler ON: {e}")
            return False
    
    def turn_boiler_off(self) -> bool:
        """Turn boiler OFF via API and update DB."""
        try:
            # Call thermostat OFF API (handles Shelly device)
            response = requests.post(self.thermostat_off_api, timeout=10)
            response.raise_for_status()
            
            # Update boiler status in DB
            success = self.sensor_service.set_boiler_status(False)
            
            if success:
                print("✅ Boiler turned OFF")
                return True
            else:
                print("⚠️ Boiler API succeeded but DB update failed")
                return False
                
        except Exception as e:
            print(f"❌ Error turning boiler OFF: {e}")
            return False
    
    def check_and_control(self):
        """Main control logic: compare temperatures and control boiler."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n{'='*60}")
        print(f"🔍 Thermostat check at {timestamp}")
        print(f"{'='*60}")
        
        # Get current temperature
        current_temp = self.get_current_temperature()
        if current_temp is None:
            print("⚠️ Skipping control cycle - no temperature data")
            return
        
        # Get target temperature
        target_temp = self.get_target_temperature()
        if target_temp is None:
            print("⚠️ Skipping control cycle - no target temperature")
            return
        
        # Get current boiler status
        is_on = self.get_boiler_status()
        print(f"🔥 Boiler current status: {'ON' if is_on else 'OFF'}")
        
        # Calculate temperature difference
        temp_diff = target_temp - current_temp
        print(f"📈 Temperature difference: {temp_diff:+.2f}°C")
        
        # Control logic with hysteresis
        if temp_diff > self.temperature_tolerance:
            # Need heating: current temp is below target
            if not is_on:
                print(f"🔥 Temperature too low ({current_temp:.1f}°C < {target_temp:.1f}°C)")
                print("   → Turning boiler ON")
                self.turn_boiler_on()
            else:
                print(f"✓ Heating in progress ({current_temp:.1f}°C → {target_temp:.1f}°C)")
                
        elif temp_diff < -self.temperature_tolerance:
            # Too hot: current temp is above target
            if is_on:
                print(f"🌡️ Temperature too high ({current_temp:.1f}°C > {target_temp:.1f}°C)")
                print("   → Turning boiler OFF")
                self.turn_boiler_off()
            else:
                print(f"✓ No heating needed ({current_temp:.1f}°C > {target_temp:.1f}°C)")
                
        else:
            # Within tolerance range
            if is_on:
                print(f"🎯 Target reached ({current_temp:.1f}°C ≈ {target_temp:.1f}°C)")
                print("   → Turning boiler OFF")
                self.turn_boiler_off()
            else:
                print(f"✓ Temperature stable ({current_temp:.1f}°C ≈ {target_temp:.1f}°C)")
        
        print(f"{'='*60}\n")
    
    def run(self):
        """Main loop that runs in background thread."""
        print("🚀 Thermostat controller started")
        print(f"⏱️ Check interval: {self.check_interval} seconds")
        
        while self.running:
            try:
                self.check_and_control()
            except Exception as e:
                print(f"❌ Error in control loop: {e}")
            
            # Wait for next check
            time.sleep(self.check_interval)
        
        print("🛑 Thermostat controller stopped")
    
    def start(self):
        """Start the thermostat controller in a background thread."""
        if self.running:
            print("⚠️ Thermostat controller already running")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        print("✅ Thermostat controller thread started")
    
    def stop(self):
        """Stop the thermostat controller."""
        if not self.running:
            print("⚠️ Thermostat controller not running")
            return
        
        print("🛑 Stopping thermostat controller...")
        self.running = False
        
        if self.thread:
            self.thread.join(timeout=5)
        
        print("✅ Thermostat controller stopped")