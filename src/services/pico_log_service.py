import json
import logging
from datetime import datetime
from flask_socketio import SocketIO, emit, disconnect
from flask import request
import psycopg2
import psycopg2.extras

class PicoLogService:
    """Service to manage Raspberry Pi Pico W logs via WebSocket"""
    
    def __init__(self, db_config, socketio):
        self.db_config = db_config
        self.socketio = socketio
        self.logger = logging.getLogger(__name__)
        self.connected_clients = set()
        self.setup_socketio_handlers()

    def setup_socketio_handlers(self):
        """Setup WebSocket event handlers"""
        
        @self.socketio.on('connect', namespace='/pico-logs')
        def handle_connect():
            client_id = request.sid
            self.connected_clients.add(client_id)
            self.logger.info(f"Client {client_id} connected to pico-logs namespace")
            
            # Send recent logs to newly connected client
            recent_logs = self.get_recent_logs(limit=50)
            emit('logs_history', {'logs': recent_logs})
        
        @self.socketio.on('disconnect', namespace='/pico-logs')
        def handle_disconnect():
            client_id = request.sid
            self.connected_clients.discard(client_id)
            self.logger.info(f"Client {client_id} disconnected from pico-logs namespace")
        
        @self.socketio.on('pico_log', namespace='/pico-logs')
        def handle_pico_log(data):
            """Handle incoming log from Pico W"""
            try:
                log_entry = self.process_pico_log(data)
                if log_entry:
                    # Save to database
                    self.save_log_to_db(log_entry)
                    
                    # Broadcast to all connected clients
                    self.socketio.emit('new_log', log_entry, namespace='/pico-logs')
                    
                    self.logger.info(f"Processed log from Pico W: {log_entry['message'][:50]}...")
            except Exception as e:
                self.logger.error(f"Error processing Pico log: {str(e)}")
        
        @self.socketio.on('clear_logs', namespace='/pico-logs')
        def handle_clear_logs():
            """Handle request to clear logs"""
            try:
                self.clear_logs_from_db()
                self.socketio.emit('logs_cleared', namespace='/pico-logs')
                self.logger.info("Logs cleared by user request")
            except Exception as e:
                self.logger.error(f"Error clearing logs: {str(e)}")

    def process_pico_log(self, data):
        """Process incoming log data from Pico W"""
        try:
            if isinstance(data, str):
                data = json.loads(data)
            
            # Extract log information
            timestamp = data.get('timestamp') or datetime.now().isoformat()
            level = data.get('level', 'INFO').upper()
            message = data.get('message', '')
            sensor_data = data.get('sensor_data', {})
            device_id = data.get('device_id', 'pico-w')
            
            # Validate required fields
            if not message:
                self.logger.warning("Received log with empty message")
                return None
            
            log_entry = {
                'id': None,  # Will be set by database
                'timestamp': timestamp,
                'level': level,
                'message': message,
                'sensor_data': sensor_data,
                'device_id': device_id,
                'created_at': datetime.now().isoformat()
            }
            
            return log_entry
            
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in Pico log: {str(e)}")
            return None
        except Exception as e:
            self.logger.error(f"Error processing Pico log: {str(e)}")
            return None

    def save_log_to_db(self, log_entry):
        """Save log entry to database"""
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            
            # Create table if it doesn't exist
            create_table_query = """
                CREATE TABLE IF NOT EXISTS pico_logs (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    level VARCHAR(10) NOT NULL,
                    message TEXT NOT NULL,
                    sensor_data JSONB,
                    device_id VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """
            cur.execute(create_table_query)
            
            # Insert log entry
            insert_query = """
                INSERT INTO pico_logs (timestamp, level, message, sensor_data, device_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id;
            """
            
            timestamp = datetime.fromisoformat(log_entry['timestamp'].replace('Z', '+00:00'))
            created_at = datetime.fromisoformat(log_entry['created_at'].replace('Z', '+00:00'))
            
            cur.execute(insert_query, (
                timestamp,
                log_entry['level'],
                log_entry['message'],
                json.dumps(log_entry['sensor_data']),
                log_entry['device_id'],
                created_at
            ))
            
            log_id = cur.fetchone()[0]
            log_entry['id'] = log_id
            
            conn.commit()
            
            # Clean up old logs (keep only last 1000 entries)
            cleanup_query = """
                DELETE FROM pico_logs
                WHERE id NOT IN (
                    SELECT id FROM pico_logs
                    ORDER BY created_at DESC
                    LIMIT 1000
                );
            """
            cur.execute(cleanup_query)
            conn.commit()
            
        except Exception as e:
            if conn:
                conn.rollback()
            self.logger.error(f"Error saving log to database: {str(e)}")
            raise
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_recent_logs(self, limit=50):
        """Get recent logs from database"""
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            
            query = """
                SELECT id, timestamp, level, message, sensor_data, device_id, created_at
                FROM pico_logs
                ORDER BY created_at DESC
                LIMIT %s;
            """
            cur.execute(query, (limit,))
            results = cur.fetchall()
            
            logs = []
            for row in results:
                log_entry = {
                    'id': row[0],
                    'timestamp': row[1].isoformat() if row[1] else None,
                    'level': row[2],
                    'message': row[3],
                    'sensor_data': row[4] if row[4] else {},
                    'device_id': row[5],
                    'created_at': row[6].isoformat() if row[6] else None
                }
                logs.append(log_entry)
            
            return list(reversed(logs))  # Return in chronological order
            
        except Exception as e:
            self.logger.error(f"Error fetching recent logs: {str(e)}")
            return []
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def clear_logs_from_db(self):
        """Clear all logs from database"""
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor()
            
            cur.execute("DELETE FROM pico_logs;")
            conn.commit()
            
        except Exception as e:
            if conn:
                conn.rollback()
            self.logger.error(f"Error clearing logs from database: {str(e)}")
            raise
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    def get_log_stats(self):
        """Get statistics about logs"""
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            
            # Get log count by level
            level_query = """
                SELECT level, COUNT(*) as count
                FROM pico_logs
                WHERE created_at >= NOW() - INTERVAL '24 hours'
                GROUP BY level
                ORDER BY count DESC;
            """
            cur.execute(level_query)
            level_stats = cur.fetchall()
            
            # Get total count
            total_query = "SELECT COUNT(*) as total FROM pico_logs;"
            cur.execute(total_query)
            total_count = cur.fetchone()[0]
            
            return {
                'total_logs': total_count,
                'level_stats': [{'level': row[0], 'count': row[1]} for row in level_stats]
            }
            
        except Exception as e:
            self.logger.error(f"Error getting log stats: {str(e)}")
            return {'total_logs': 0, 'level_stats': []}
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()