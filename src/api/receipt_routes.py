"""
Receipt Routes - API endpoints per la gestione scontrini
"""
import logging
from flask import Blueprint, request, jsonify, render_template

from services.receipt_service import receipt_service

logger = logging.getLogger(__name__)

# Blueprint per le rotte degli scontrini
receipt_bp = Blueprint('receipt', __name__, url_prefix='/api/receipt')

@receipt_bp.route('/upload', methods=['POST'])
def upload_receipt():
    """Upload e processamento scontrino"""
    if 'file' not in request.files:
        return jsonify({'error': 'Nessun file caricato'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nessun file selezionato'}), 400
    
    # Verifica tipo file
    allowed_extensions = {'png', 'jpg', 'jpeg', 'pdf', 'tiff', 'bmp'}
    file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    
    if file_extension not in allowed_extensions:
        return jsonify({'error': f'Tipo file non supportato. Usa: {", ".join(allowed_extensions)}'}), 400
    
    try:
        result = receipt_service.process_receipt_file(file)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Errore upload scontrino: {e}")
        return jsonify({'error': f'Errore processamento: {str(e)}'}), 500

@receipt_bp.route('/prezzi-minimi', methods=['GET'])
def get_prezzi_minimi():
    """API per ottenere i prezzi minimi (STATISTICA PRINCIPALE)"""
    try:
        results = receipt_service.get_prezzi_minimi()
        return jsonify(results)
    except Exception as e:
        logger.error(f"Errore prezzi minimi: {e}")
        return jsonify({'error': 'Errore recupero dati'}), 500

@receipt_bp.route('/statistiche', methods=['GET'])
def get_statistiche():
    """API per statistiche generali"""
    try:
        stats = receipt_service.get_statistiche_generali()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Errore statistiche: {e}")
        return jsonify({'error': 'Errore recupero statistiche'}), 500

@receipt_bp.route('/scontrini', methods=['GET'])
def get_scontrini():
    """Lista tutti gli scontrini"""
    try:
        scontrini = receipt_service.get_scontrini_list()
        return jsonify(scontrini)
    except Exception as e:
        logger.error(f"Errore lista scontrini: {e}")
        return jsonify({'error': 'Errore recupero scontrini'}), 500

@receipt_bp.route('/health', methods=['GET'])
def health_check():
    """Health check per il servizio scontrini"""
    return jsonify({'status': 'ok', 'service': 'receipt_service'})

# Rotta per la pagina web degli scontrini
@receipt_bp.route('/page', methods=['GET'])
def receipt_page():
    """Pagina web per la gestione scontrini"""
    return render_template('receipts.html')