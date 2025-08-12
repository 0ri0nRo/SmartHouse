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
"""

from flask import Flask, send_from_directory # pyright: ignore[reportMissingImports]
from flask_cors import CORS # type: ignore
import os
import logging

# Local project imports (refactored structure)
from config.settings import get_config, setup_logging
from utils.json_encoder import CustomJSONEncoder
from api import register_blueprints


def create_app():
    """
    Factory function to create and configure a Flask application.

    This function performs the following steps:
    - Sets up logging for the application.
    - Creates a Flask app instance.
    - Loads and updates the app configuration.
    - Configures Cross-Origin Resource Sharing (CORS).
    - Sets a custom JSON encoder for the app.
    - Registers all API blueprints with the app.

    Returns:
        Flask: The configured Flask application instance.
    """

    # Setup logging
    logger = setup_logging()
    logger.info("Starting Flask application...")

    # Create Flask app instance
    app = Flask(__name__)

    # Load configuration
    config = get_config()
    app.config.update(config)

    # Enable CORS
    CORS(app)

    # Set custom JSON encoder
    app.json_encoder = CustomJSONEncoder

    # Register all API blueprints
    register_blueprints(app)

    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory('static', 'favicon.ico')

    logger.info("Flask application configured successfully")

    return app


def main():
    """Main function to start the Flask development server."""
    app = create_app()

    # Server parameters
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("DEBUG", "False").lower() == "true"

    logging.info(f"Starting server on {host}:{port} (debug={debug})")

    # Run the server
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
