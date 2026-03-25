from flask import Blueprint, jsonify, request
from models.database import handle_db_error
from services.train_service import TrainService
from config.settings import get_config

train_bp     = Blueprint('train', __name__)
config       = get_config()
train_service = TrainService(config['DB_CONFIG'])


@train_bp.route('/trains_data/<train_destination>', methods=['GET'])
@handle_db_error
def api_trains_data_fetch(train_destination):
    """
    Fetch train data for a given destination.

    Optional query param:
        from_station — the departure board to scrape.
                       Defaults to 'ROMA TERMINI'.
                       Pass 'COLLEFERRO' when the user is away and wants
                       trains departing from Colleferro.

    Examples:
        GET /trains_data/COLLEFERRO                          → Roma Termini → Colleferro
        GET /trains_data/ROMA TERMINI?from_station=COLLEFERRO → Colleferro → Roma Termini
    """
    from_station = request.args.get('from_station', 'ROMA TERMINI').upper()
    res = train_service.fetch_and_save(train_destination, from_station=from_station)
    return jsonify(res)