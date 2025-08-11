import os
from dotenv import load_dotenv

load_dotenv()

def get_config():
    """Centralizza tutte le configurazioni dell'applicazione"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    return {
        'BASE_DIR': base_dir,
        'CREDENTIALS_PATH': os.path.join(base_dir, "gcredentials.json"),
        'SHEET_NAME': "My NW",
        
        # Database Config
        'DB_CONFIG': {
            'host': os.getenv('DB_HOST'),
            'database': os.getenv('DB_DATABASE'),
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD')
        },
        
        # MongoDB
        'MONGO_URI': os.getenv('MONGO_URI'),
        
        # Email Config
        'SMTP_SERVER': os.getenv('SMTP_SERVER'),
        'SMTP_PORT': os.getenv('SMTP_PORT'),
        'EMAIL_USERNAME': os.getenv('EMAIL_USERNAME'),
        'EMAIL_PASSWORD': os.getenv('EMAIL_PASSWORD'),
        
        # SSH Config
        'HOST_PI': os.getenv('HOST_PI'),
        'PORT_PI': int(os.getenv('PORT_PI') or 22),
        'USERNAME_PI': os.getenv('USERNAME_PI'),
        
        # Redis Config
        'REDIS_HOST': os.getenv('REDIS_HOST', 'redis'),
        'REDIS_PORT': int(os.getenv('REDIS_PORT', 6379))
    }

# Configurazione di logging
def setup_logging():
    import logging
    logging.basicConfig(level=logging.INFO)
    return logging.getLogger(__name__)