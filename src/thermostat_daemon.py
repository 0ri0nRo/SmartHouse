import time
import logging
from services.sensor_service import SensorService
from config.settings import get_config


class ThermostatDaemon:
    def __init__(self, check_interval=60, sync_interval=300):
        self.check_interval = check_interval
        self.sync_interval = sync_interval

        self.last_check = 0
        self.last_sync = 0
        self.running = True

        config = get_config()
        self.sensor_service = SensorService(config['DB_CONFIG'])

        self.logger = logging.getLogger("thermostat_daemon")
        self.logger.info("🌡️ ThermostatDaemon inizializzato")

    def run(self):
        """Loop infinito del daemon."""
        self.logger.info("🚀 ThermostatDaemon avviato")

        while self.running:
            now = time.time()

            # LOGICA TERMOSTATO
            if now - self.last_check >= self.check_interval:
                try:
                    result = self.sensor_service.thermostat_control_logic()
                    if result.get("action") not in ("none", "no_change"):
                        self.logger.info(f"Azione termostato: {result}")
                    self.last_check = now
                except Exception as e:
                    self.logger.error(f"Errore controllo termostato: {e}")

            # SYNC SHELLY
            if now - self.last_sync >= self.sync_interval:
                try:
                    self.logger.info("🔄 Sincronizzazione con Shelly...")
                    self.sensor_service.sync_boiler_with_shelly()
                    self.last_sync = now
                except Exception as e:
                    self.logger.error(f"Errore sync Shelly: {e}")

            time.sleep(1)  # 🔴 OBBLIGATORIO per non saturare CPU

    def stop(self):
        self.running = False
        try:
            self.sensor_service.db.close()
        except Exception:
            pass
