from flask import Blueprint, jsonify, render_template
from models.database import handle_db_error
from services.train_service import TrainService
from config.settings import get_config

train_bp = Blueprint('train', __name__)
config = get_config()
train_service = TrainService(config['DB_CONFIG'])

@train_bp.route('/trains_data/<train_destination>', methods=['GET'])
@handle_db_error
def api_trains_data_fetch(train_destination):
    """API per recuperare e salvare dati treni per una destinazione"""
    res = train_service.fetch_and_save(train_destination)
    return jsonify(res)

# Route alternativa per backward compatibility
@train_bp.route('/trains_data/<destination>', methods=['GET'])
@handle_db_error
def api_trains_data(destination):
    """API alternativa per recuperare dati treni (backward compatibility)"""
    res = train_service.fetch_and_save(destination)
    return jsonify(res)

@train_bp.route('/train')
def page_train():
    """Pagina per visualizzare informazioni sui treni"""
    return render_template('train.html')