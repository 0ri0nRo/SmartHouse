import os
from dotenv import load_dotenv

load_dotenv()

UPLOAD_FOLDER    = os.environ.get('UPLOAD_FOLDER', 'uploads')
MAX_UPLOAD_SIZE  = 16 * 1024 * 1024
TESSERACT_CMD    = os.environ.get('TESSERACT_CMD', '/usr/bin/tesseract')
TESSERACT_LANGUAGE = 'ita+eng'

RECEIPTS_DB_CONFIG = {
    'host':     os.environ.get('DB_HOST', 'localhost'),
    'database': os.environ.get('DB_NAME', 'sensor_data'),
    'user':     os.environ.get('DB_USER', 'postgres'),
    'password': os.environ.get('DB_PASSWORD', '1234'),
    'port':     int(os.environ.get('DB_PORT', '5432'))
}

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'tiff', 'bmp'}
RECEIPT_LOG_LEVEL  = os.environ.get('RECEIPT_LOG_LEVEL', 'INFO')


def get_config():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        'BASE_DIR':          base_dir,
        'CREDENTIALS_PATH':  os.path.join(base_dir, "gcredentials.json"),
        'SHEET_NAME':        "My NW",

        # Database
        'DB_CONFIG': {
            'host':     os.getenv('DB_HOST',     'localhost'),
            'database': os.getenv('DB_DATABASE', 'sensor_data'),
            'user':     os.getenv('DB_USER',     'postgres'),
            'password': os.getenv('DB_PASSWORD', '1234'),
        },

        # MongoDB
        'MONGO_URI': os.getenv('MONGO_URI', 'mongodb://root:example@localhost:27017/'),

        # Email
        'SMTP_SERVER':    os.getenv('SMTP_SERVER'),
        'SMTP_PORT':      os.getenv('SMTP_PORT'),
        'EMAIL_USERNAME': os.getenv('EMAIL_USERNAME'),
        'EMAIL_PASSWORD': os.getenv('EMAIL_PASSWORD'),

        # SSH legacy
        'HOST_PI':     os.getenv('HOST_PI',     'localhost'),
        'PORT_PI':     int(os.getenv('PORT_PI') or 22),
        'USERNAME_PI': os.getenv('USERNAME_PI', 'orion'),

        # Redis
        'REDIS_HOST': os.getenv('REDIS_HOST', 'localhost'),
        'REDIS_PORT': int(os.getenv('REDIS_PORT', 6379)),

        # Raspberry Pi SSH (system_routes)
        'RASPI_HOST_IP':       os.getenv('RASPI_HOST_IP',       '127.0.0.1'),
        'RASPI_HOST_USER':     os.getenv('RASPI_HOST_USER',     'orion'),
        'RASPI_HOST_PASSWORD': os.getenv('RASPI_HOST_PASSWORD', None),
        'RASPI_HOST_KEY_PATH': os.getenv('RASPI_HOST_KEY_PATH', '/run/secrets/id_rsa'),
    }


def setup_logging():
    import logging
    logging.basicConfig(level=logging.INFO)
    return logging.getLogger(__name__)