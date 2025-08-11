from flask import Blueprint, jsonify, request, render_template
import psycopg2
import psycopg2.extras
from models.database import handle_db_error
from config.settings import get_config

security_bp = Blueprint('security', __name__)
config = get_config()

@security_bp.route('/security/alarm', methods=['GET', 'POST'])
@handle_db_error
def alarm_status():
    """API per gestire lo stato dell'allarme di sicurezza"""
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(**config['DB_CONFIG'])
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        if request.method == 'GET':
            cur.execute("SELECT status, timestamp FROM alarms_status ORDER BY timestamp DESC LIMIT 1;")
            r = cur.fetchone()
            return jsonify(r) if r else jsonify({'status': False, 'timestamp': None})
        
        else:  # POST
            data = request.get_json()
            if 'status' not in data:
                return jsonify({'error': 'Campo status mancante'}), 400
            
            status = data['status']
            cur.execute("DELETE FROM alarms_status;")
            cur.execute("INSERT INTO alarms_status (status) VALUES (%s);", (status,))
            conn.commit()
            return jsonify({'message': "Stato aggiornato"}), 201
    
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@security_bp.route('/security')
def page_security():
    """Pagina per il sistema di sicurezza"""
    return render_template('security.html')