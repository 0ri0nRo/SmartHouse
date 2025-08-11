"""
Flask Application - Entry Point Principale

Applicazione Flask refactorata con struttura modulare per gestire:
- Sensori di temperatura e umidità
- Qualità dell'aria
- Dispositivi di rete
- Informazioni sui treni
- Todo list
- Sistema di sicurezza
- Backup e comandi SSH
- Gestione spese
"""

from flask import Flask
from flask_cors import CORS
import os
import logging

# Import locali del progetto refactorato
from config.settings import get_config, setup_logging
from utils.json_encoder import CustomJSONEncoder
from api import register_blueprints

def create_app():
    """Factory per creare l'applicazione Flask"""
    
    # Setup logging
    logger = setup_logging()
    logger.info("Avvio dell'applicazione Flask...")
    
    # Crea l'app Flask
    app = Flask(__name__)
    
    # Carica configurazione
    config = get_config()
    app.config.update(config)
    
    # Configura CORS
    CORS(app)
    
    # Configura JSON encoder personalizzato
    app.json_encoder = CustomJSONEncoder
    
    # Registra tutti i blueprint delle API
    register_blueprints(app)
    
    logger.info("Applicazione Flask configurata correttamente")
    
    return app

def main():
    """Funzione principale per avviare il server"""
    app = create_app()
    
    # Parametri del server
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    
    logging.info(f"Avvio server su {host}:{port} (debug={debug})")
    
    # Avvia il server
    app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    main()