"""
services/email_service.py - Email Service
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails"""
    
    def __init__(self, smtp_server: str, smtp_port: int, username: str, password: str):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
    
    def send_email(self, to_email: str, subject: str, body: str, is_html: bool = False):
        """Send email"""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.username
            msg['To'] = to_email
            msg['Subject'] = subject
            
            msg.attach(MIMEText(body, 'html' if is_html else 'plain'))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.username, self.password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False
    
    def send_backup_notification(self):
        """Send backup completion notification"""
        subject = "Sistema - Backup Completato"
        body = "Il backup del sistema è stato completato con successo."
        return self.send_email(self.username, subject, body)


"""
services/network_service.py - Network Scanning Service
"""

import nmap
import psutil
from datetime import datetime
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


class NetworkService:
    """Service for network operations"""
    
    def __init__(self, postgres_handler):
        self.db = postgres_handler
    
    def scan_network(self, network: str = '192.168.178.0/24') -> Dict[str, Dict]:
        """Scan network for devices"""
        try:
            nm = nmap.PortScanner()
            nm.scan(hosts=network, arguments='-sn')
            
            devices = {}
            for host in nm.all_hosts():
                hostname = nm[host].hostname() or 'Unknown'
                devices[host] = {
                    'hostname': hostname,
                    'status': nm[host].state()
                }
            
            # Save to database
            self._save_devices_to_db(devices)
            
            logger.info(f"Network scan completed. Found {len(devices)} devices")
            return devices
            
        except Exception as e:
            logger.error(f"Network scan failed: {e}")
            return {}
    
    def _save_devices_to_db(self, devices: Dict[str, Dict]):
        """Save scanned devices to database"""
        try:
            self.db.create_table_if_not_exists_network_devices()
            
            timestamp = datetime.now()
            for ip, info in devices.items():
                query = """
                INSERT INTO network_devices (ip_address, hostname, status, timestamp) 
                VALUES (%s, %s, %s, %s)
                """
                params = (ip, info['hostname'], info['status'], timestamp)
                self.db.execute_query(query, params)
            
            logger.info("Network devices saved to database")
            
        except Exception as e:
            logger.error(f"Failed to save devices to database: {e}")
    
    def get_raspberry_pi_stats(self) -> Dict:
        """Get Raspberry Pi system statistics"""
        try:
            stats = {}
            
            # CPU temperature
            try:
                with open('/sys/class/thermal/thermal_zone0/temp', 'r') as temp_file:
                    temp_str = temp_file.read().strip()
                    stats['temperature'] = float(temp_str) / 1000.0
            except FileNotFoundError:
                stats['temperature'] = None
            
            # CPU usage
            stats['cpuUsage'] = psutil.cpu_percent(interval=1)
            
            # Memory stats
            memory = psutil.virtual_memory()
            stats['memoryUsed'] = f'{memory.used / (1024 ** 3):.2f} GB'
            stats['memoryTotal'] = f'{memory.total / (1024 ** 3):.2f} GB'
            
            # Disk stats
            disk = psutil.disk_usage('/')
            stats['diskUsed'] = f'{disk.used / (1024 ** 3):.2f} GB'
            stats['diskTotal'] = f'{disk.total / (1024 ** 3):.2f} GB'
            stats['diskFree'] = f'{disk.free / (1024 ** 3):.2f} GB'
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get system stats: {e}")
            return {'error': str(e)}


"""
services/google_sheets_service.py - Google Sheets Integration
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class GoogleSheetsService:
    """Service for Google Sheets operations"""
    
    def __init__(self, credentials_path: str, sheet_name: str):
        self.credentials_path = credentials_path
        self.sheet_name = sheet_name
        # Import here to avoid dependency issues if not used
        try:
            from expenses_gsheet import GoogleSheetExpenseManager, SheetValueFetcher
            self.manager = GoogleSheetExpenseManager(credentials_path, sheet_name)
            self.fetcher = SheetValueFetcher(credentials_path, sheet_name)
        except ImportError as e:
            logger.warning(f"Google Sheets dependencies not available: {e}")
            self.manager = None
            self.fetcher = None
    
    def add_expense(self, description: str, date: str, amount: float, category: str) -> bool:
        """Add expense to Google Sheets"""
        if not self.manager:
            raise ValueError("Google Sheets manager not available")
        
        try:
            self.manager.add_expense(description, date, amount, category)
            logger.info(f"Expense added: {description} - {amount}")
            return True
        except Exception as e:
            logger.error(f"Failed to add expense: {e}")
            raise
    
    def get_summary_expenses(self) -> Dict[str, Any]:
        """Get expense summary from Google Sheets"""
        if not self.manager:
            raise ValueError("Google Sheets manager not available")
        
        try:
            return self.manager.get_summary_expenses()
        except Exception as e:
            logger.error(f"Failed to get expense summary: {e}")
            raise
    
    def get_cell_value_p48(self) -> Optional[str]:
        """Get specific cell value (P48)"""
        if not self.fetcher:
            raise ValueError("Google Sheets fetcher not available")
        
        try:
            return self.fetcher.get_cell_value_p48()
        except Exception as e:
            logger.error(f"Failed to get P48 value: {e}")
            raise
    
    def get_cached_value(self) -> Optional[str]:
        """Get cached value from Redis"""
        if not self.fetcher:
            return None
        
        try:
            return self.fetcher.get_cached_value()
        except Exception as e:
            logger.error(f"Failed to get cached value: {e}")
            return None


"""
services/train_service.py - Train Information Service
"""

import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class TrainService:
    """Service for train information"""
    
    def __init__(self, postgres_handler):
        self.db = postgres_handler
    
    def get_trains_for_destination(self, destination: str, limit: int = 4) -> Dict[str, List[Dict]]:
        """Get trains before and after current time for destination"""
        try:
            self.db.create_table_if_not_exists_trains()
            
            now = datetime.now()
            
            # Past trains
            query_past = """
            SELECT train_number, destination, time, delay, platform, stops, timestamp
            FROM trains
            WHERE time < %s AND stops ILIKE %s
            ORDER BY time DESC
            LIMIT %s;
            """
            past_trains = self.db.execute_query(
                query_past, 
                (now.time(), f'%{destination}%', limit)
            )
            
            # Future trains
            query_future = """
            SELECT train_number, destination, time, delay, platform, stops, timestamp
            FROM trains
            WHERE time > %s AND stops ILIKE %s
            ORDER BY time ASC
            LIMIT %s;
            """
            future_trains = self.db.execute_query(
                query_future, 
                (now.time(), f'%{destination}%', limit)
            )
            
            # Format results
            def format_train(train):
                return {
                    "train_number": train['train_number'],
                    "destination": train['destination'],
                    "time": train['time'].strftime('%H:%M'),
                    "delay": train['delay'],
                    "platform": train['platform'],
                    "stops": train['stops'],
                    "timestamp": train['timestamp'].isoformat()
                }
            
            return {
                "result": [format_train(train) for train in future_trains or []],
                "result_old": [format_train(train) for train in past_trains or []]
            }
            
        except Exception as e:
            logger.error(f"Failed to get trains for {destination}: {e}")
            return {"error": str(e)}
    
    def scrape_and_save_trains(self, destination: str, api_url: str):
        """Scrape train data and save to database"""
        try:
            # Import here to avoid circular dependencies
            from scraper import TrainScraper
            
            scraper = TrainScraper(api_url, self.db.db_config)
            trains = scraper.parse_trains(destination)
            scraper.save_trains_to_db(trains)
            
            logger.info(f"Train data scraped and saved for {destination}")
            
        except Exception as e:
            logger.error(f"Failed to scrape train data: {e}")
            raise