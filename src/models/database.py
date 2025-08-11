import psycopg2
import psycopg2.extras
from psycopg2 import Error
import logging
import traceback
from functools import wraps
from flask import jsonify

logger = logging.getLogger(__name__)

def get_db_connection(db_config):
    """Crea una connessione al database PostgreSQL"""
    try:
        conn = psycopg2.connect(**db_config)
        return conn
    except Exception as e:
        logger.error(f"DB conn error: {e}")
        raise

def handle_db_error(func):
    """Decorator per gestire gli errori del database in modo uniforme"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except psycopg2.OperationalError as e:
            logger.error(f"OperationalError in {func.__name__}: {e}")
            return jsonify({'error': 'Database connection error', 'message': str(e)}), 503
        except psycopg2.Error as e:
            logger.error(f"Database error in {func.__name__}: {e}")
            return jsonify({'error': 'Database error', 'message': str(e)}), 500
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")
            logger.debug(traceback.format_exc())
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
    return wrapper

class BaseService:
    """Classe base per tutti i servizi che usano il database"""
    
    def __init__(self, db_config):
        self.db_config = db_config

    def _connect(self):
        """Crea una connessione al database"""
        return psycopg2.connect(**self.db_config)
    
    def _execute_query(self, query, params=None, fetch_one=False, fetch_all=True):
        """Utility per eseguire query in modo sicuro"""
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(query, params)
            
            if fetch_one:
                return cur.fetchone()
            elif fetch_all:
                return cur.fetchall()
            else:
                conn.commit()
                return cur.rowcount
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()