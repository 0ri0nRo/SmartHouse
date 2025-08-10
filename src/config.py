"""
Configuration module for Flask application
Centralizes all environment variables and settings
"""

import os
from pathlib import Path


class Config:
    """Base configuration class"""
    
    # Flask settings
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ['true', '1', 'on']
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
    
    # Database configuration
    DATABASE_CONFIG = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_DATABASE', 'smart_home'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', '')
    }
    
    # MongoDB configuration
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    
    # Email configuration
    SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
    EMAIL_USERNAME = os.getenv('EMAIL_USERNAME', '')
    EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD', '')
    
    # Google Sheets configuration
    BASE_DIR = Path(__file__).parent
    GOOGLE_CREDENTIALS_PATH = os.getenv(
        'GOOGLE_CREDENTIALS_PATH',
        str(BASE_DIR / "gcredentials.json")
    )
    GOOGLE_SHEET_NAME = os.getenv('GOOGLE_SHEET_NAME', 'My NW')
    
    # Raspberry Pi SSH configuration
    HOST_PI = os.getenv('HOST_PI', '')
    PORT_PI = int(os.getenv('PORT_PI', 22))
    USERNAME_PI = os.getenv('USERNAME_PI', '')
    
    # Redis configuration
    REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
    
    # Network scanning
    NETWORK_RANGE = os.getenv('NETWORK_RANGE', '192.168.178.0/24')
    
    # Backup script path
    BACKUP_SCRIPT_PATH = os.getenv('BACKUP_SCRIPT_PATH', '/usr/local/bin/backup.sh')
    
    # Train API configuration
    TRAIN_API_URL = os.getenv(
        'TRAIN_API_URL',
        'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2416&arrivals=False'
    )


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    # Use in-memory SQLite for testing
    DATABASE_CONFIG = {
        'host': 'localhost',
        'database': ':memory:',
        'user': 'test',
        'password': 'test'
    }


# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}