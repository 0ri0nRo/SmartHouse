""" Flask Application - Main Entry Point

Refactored Flask application with a modular structure to handle:
- Temperature and humidity sensors
- Air quality
- Network devices
- Train information
- To-do list
- Security system
- Backup and SSH commands
- Expense management
- Raspberry Pi Pico W logs via WebSocket
"""

from flask import Flask, send_from_directory # pyright: ignore[reportMissingImports]
from flask_cors import CORS # type: ignore
from flask_socketio import SocketIO # type: ignore
import os
import logging

# Local project imports (refactored structure)
from config.settings import get_config, setup_logging
from utils.json_encoder import CustomJSONEncoder
from api import register_blueprints

# Import the new Pico logs service and blueprint
from services.pico_log_service import PicoLogService
from api.pico_logs_routes import init_pico_logs_service, pico_logs_bp


def create_app():
    """
    Factory function to create and configure a Flask application.

    This function performs the following steps:
    - Sets up logging for the application.
    - Creates a Flask app instance.
    - Loads and updates the app configuration.
    - Configures Cross-Origin Resource Sharing (CORS).
    - Sets a custom JSON encoder for the app.
    - Initializes WebSocket support.
    - Sets up the Pico logs service.
    - Registers all API blueprints with the app.

    Returns:
        tuple: The configured Flask application instance and SocketIO instance.
    """

    # Setup logging
    logger = setup_logging()
    logger.info("Starting Flask application...")

    # Create Flask app instance
    app = Flask(__name__)

    # Load configuration
    config = get_config()
    app.config.update(config)
    
    # Add secret key for session management (required for SocketIO)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-this')

    # Enable CORS
    CORS(app, resources={
        r"/api/*": {"origins": "*"},
        r"/socket.io/*": {"origins": "*"}
    })

    # Set custom JSON encoder
    app.json_encoder = CustomJSONEncoder

    # Initialize SocketIO with CORS settings
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
        async_mode='threading'
    )

    # Initialize Pico logs service
    try:
        pico_log_service = PicoLogService(config['DB_CONFIG'], socketio)
        init_pico_logs_service(pico_log_service)
        logger.info("Pico logs WebSocket service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Pico logs service: {str(e)}")
        # Continue without the service - it's not critical for basic functionality

    # Register all API blueprints
    register_blueprints(app)
    
    # Register the new Pico logs blueprint
    app.register_blueprint(pico_logs_bp)

    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory('static', 'favicon.ico')

    # Add a health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'service': 'raspberry-pi-dashboard'}, 200

    logger.info("Flask application configured successfully")

    return app, socketio


def main():
    """Main function to start the Flask development server with WebSocket support."""
    app, socketio = create_app()

    # Server parameters
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("DEBUG", "False").lower() == "true"

    logging.info(f"Starting server with WebSocket support on {host}:{port} (debug={debug})")

    # Run the server with SocketIO
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=False,
        allow_unsafe_werkzeug=True
    )


if __name__ == "__main__":
    main()