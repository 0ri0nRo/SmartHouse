from flask import Blueprint, jsonify, request, render_template
import psycopg2
import psycopg2.extras
from models.database import handle_db_error
from config.settings import get_config

# Blueprint for security system endpoints
security_bp = Blueprint('security', __name__)
config = get_config()


@security_bp.route('/security/alarm', methods=['GET', 'POST'])
@handle_db_error
def alarm_status():
    """
    API endpoint to manage the security alarm status.

    GET:
        Retrieves the latest alarm status and timestamp.
        Returns:
            {
                "status": <bool>,
                "timestamp": <ISO 8601 string or None>
            }

    POST:
        Updates the alarm status in the database.
        Request JSON body:
            {
                "status": <bool>
            }
        Returns:
            {
                "message": "Status updated"
            }
    """
    conn = None
    cur = None
    try:
        # Connect to the PostgreSQL database
        conn = psycopg2.connect(**config['DB_CONFIG'])
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        if request.method == 'GET':
            # Retrieve the most recent alarm status
            cur.execute("""
                SELECT status, timestamp 
                FROM alarms_status 
                ORDER BY timestamp DESC 
                LIMIT 1;
            """)
            r = cur.fetchone()
            return jsonify(r) if r else jsonify({'status': False, 'timestamp': None})
        
        else:  # POST
            # Update the alarm status
            data = request.get_json()
            if 'status' not in data:
                return jsonify({'error': 'Missing "status" field'}), 400
            
            status = data['status']
            cur.execute("DELETE FROM alarms_status;")  # Keep only the latest entry
            cur.execute("INSERT INTO alarms_status (status) VALUES (%s);", (status,))
            conn.commit()
            return jsonify({'message': "Status updated"}), 201
    
    finally:
        # Ensure resources are closed
        if cur:
            cur.close()
        if conn:
            conn.close()


@security_bp.route('/security')
def page_security():
    """
    Web page to display and control the security system.
    """
    return render_template('security.html')
