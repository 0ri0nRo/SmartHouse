"""
Flask Application - Main Entry Point

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
- Service Worker for offline functionality
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
from api.activity_routes import activity_bp
from api.ping_routes import ping_bp
from api.calendar_routes import calendar_bp
from api.recipe_routes          import recipe_bp
from api.sunmoon_routes         import sunmoon_bp
from api.news_routes import news_bp

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

    @app.route('/favicon.ico')
    def favicon():
        """Serve the favicon from the static directory."""
        try:
            return send_from_directory(
                os.path.join(app.root_path, 'static'),
                'favicon.ico',
                mimetype='image/vnd.microsoft.icon'
            )
        except Exception as e:
            app.logger.warning(f"Favicon not found: {str(e)}")
            return '', 404

    # Initialize Pico logs service
    try:
        pico_log_service = PicoLogService(config['DB_CONFIG'], socketio)
        init_pico_logs_service(pico_log_service)
        logger.info("Pico logs WebSocket service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Pico logs service: {str(e)}")
        # Continue without the service — not critical for basic functionality

    # Register all API blueprints
    register_blueprints(app)

    # Register the Pico logs blueprint
    app.register_blueprint(pico_logs_bp)

    # Register activity blueprint
    app.register_blueprint(activity_bp)
    app.register_blueprint(ping_bp)
    app.register_blueprint(calendar_bp)
    app.register_blueprint(recipe_bp)
    app.register_blueprint(sunmoon_bp)
    app.register_blueprint(news_bp)

    # Health check endpoint
    @app.route('/health')
    def health_check():
        """Health check endpoint for monitoring and load balancers."""
        return {'status': 'healthy', 'service': 'raspberry-pi-dashboard'}, 200

    # Serve React frontend for all non-API routes.
    # This must be the LAST route registered so it does not
    # shadow any of the API blueprints above.
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):
        """Return the React index.html for every unknown route so that
        React Router can handle client-side navigation."""
        react_dir = os.path.join(app.root_path, 'static', 'react')

        # If the requested path matches a real file (JS, CSS, assets) serve it
        if path and os.path.exists(os.path.join(react_dir, path)):
            return send_from_directory(react_dir, path)

        # Otherwise fall back to index.html and let React handle routing
        return send_from_directory(react_dir, 'index.html')

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