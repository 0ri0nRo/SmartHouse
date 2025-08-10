"""
utils/decorators.py - Utility decorators for error handling and common functionality
"""

import logging
import psycopg2
from functools import wraps
from flask import jsonify

logger = logging.getLogger(__name__)


def handle_db_error(func):
    """Decorator to handle common database errors"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except psycopg2.OperationalError as e:
            logger.error(f"Database operational error in {func.__name__}: {e}")
            return jsonify({
                'error': 'Database connection error',
                'message': 'Temporary database unavailability'
            }), 503
        except psycopg2.Error as e:
            logger.error(f"Database error in {func.__name__}: {e}")
            return jsonify({
                'error': 'Database error',
                'message': str(e)
            }), 500
        except Exception as e:
            logger.error(f"Generic error in {func.__name__}: {e}")
            return jsonify({
                'error': 'Internal server error',
                'message': str(e)
            }), 500
    
    return wrapper


def validate_json(required_fields=None):
    """Decorator to validate JSON request data"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from flask import request
            
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Request body is empty or malformed'}), 400
            
            if required_fields:
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    return jsonify({
                        'error': 'Missing required fields',
                        'missing_fields': missing_fields,
                        'required_fields': required_fields
                    }), 400
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def log_execution_time(func):
    """Decorator to log function execution time"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start_time = time.time()
        
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            logger.info(f"{func.__name__} executed in {execution_time:.3f} seconds")
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"{func.__name__} failed after {execution_time:.3f} seconds: {e}")
            raise
    
    return wrapper


def cache_response(timeout=300):
    """Decorator to cache response for specified timeout (in seconds)"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Simple in-memory cache implementation
            if not hasattr(wrapper, '_cache'):
                wrapper._cache = {}
            
            import time
            cache_key = f"{func.__name__}_{str(args)}_{str(kwargs)}"
            current_time = time.time()
            
            # Check if cached result exists and is still valid
            if cache_key in wrapper._cache:
                cached_result, cached_time = wrapper._cache[cache_key]
                if current_time - cached_time < timeout:
                    logger.debug(f"Returning cached result for {func.__name__}")
                    return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            wrapper._cache[cache_key] = (result, current_time)
            
            # Clean old cache entries (simple cleanup)
            if len(wrapper._cache) > 100:  # Limit cache size
                oldest_key = min(wrapper._cache.keys(), 
                               key=lambda k: wrapper._cache[k][1])
                del wrapper._cache[oldest_key]
            
            return result
        
        return wrapper
    return decorator