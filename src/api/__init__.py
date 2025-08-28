# api/__init__.py
from .sensor_routes import sensor_bp
from .air_quality_routes import air_quality_bp
from .network_routes import network_bp
from .train_routes import train_bp
from .todolist_routes import todolist_bp
from .security_routes import security_bp
from .system_routes import system_bp
from .expenses_routes import expense_bp
from .receipt_routes import receipt_bp

def register_blueprints(app):
    """Registra tutti i blueprint delle API nell'app Flask"""
    
    # Registra i blueprint
    app.register_blueprint(sensor_bp)
    app.register_blueprint(air_quality_bp)
    app.register_blueprint(network_bp)
    app.register_blueprint(train_bp)
    app.register_blueprint(todolist_bp)
    app.register_blueprint(security_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(expense_bp)
    app.register_blueprint(receipt_bp)
    
    # Log dei blueprint registrati
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Registrati tutti i blueprint delle API")

__all__ = ['register_blueprints']