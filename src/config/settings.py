import os
from dotenv import load_dotenv

load_dotenv()

def get_config():
    """Centralize all application configurations."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    return {
        'BASE_DIR': base_dir,
        'CREDENTIALS_PATH': os.path.join(base_dir, "gcredentials.json"),
        'SHEET_NAME': "My NW",
        
        # Database Configuration
        'DB_CONFIG': {
            'host': os.getenv('DB_HOST'),
            'database': os.getenv('DB_DATABASE'),
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD')
        },
        
        # MongoDB Configuration
        'MONGO_URI': os.getenv('MONGO_URI'),
        
        # Email Configuration
        'SMTP_SERVER': os.getenv('SMTP_SERVER'),
        'SMTP_PORT': os.getenv('SMTP_PORT'),
        'EMAIL_USERNAME': os.getenv('EMAIL_USERNAME'),
        'EMAIL_PASSWORD': os.getenv('EMAIL_PASSWORD'),
        
        # SSH Configuration for Raspberry Pi
        'HOST_PI': os.getenv('HOST_PI'),
        'PORT_PI': int(os.getenv('PORT_PI') or 22),
        'USERNAME_PI': os.getenv('USERNAME_PI'),
        
        # Redis Configuration
        'REDIS_HOST': os.getenv('REDIS_HOST', 'redis'),
        'REDIS_PORT': int(os.getenv('REDIS_PORT', 6379))
    }

def setup_logging():
    """Set up basic logging configuration."""
    import logging
    logging.basicConfig(level=logging.INFO)
    return logging.getLogger(__name__)