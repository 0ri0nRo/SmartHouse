"""
routes/trains.py - Train information routes
"""

from flask import Blueprint, jsonify, current_app
import logging
from services.train_service import TrainService

logger = logging.getLogger(__name__)

trains_bp = Blueprint('trains', __name__)


@trains_bp.route('/trains_data/<train_destination>')
def get_trains_data_route(train_destination):
    """Get train data for specific destination with scraping"""
    try:
        db = current_app.postgres_handler
        train_service = TrainService(db)
        
        # Scrape and save new train data
        train_service.scrape_and_save_trains(
            train_destination, 
            current_app.config['TRAIN_API_URL']
        )
        
        # Get formatted results
        results = train_service.get_trains_for_destination(train_destination)
        
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error getting trains data for {train_destination}: {e}")
        return jsonify({"error": str(e)}), 500


@trains_bp.route('/trains_data/<destination>')
def trains_data(destination):
    """Get cached train data for destination"""
    try:
        db = current_app.postgres_handler
        train_service = TrainService(db)
        
        results = train_service.get_trains_for_destination(destination)
        
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error getting cached trains data for {destination}: {e}")
        return jsonify({"error": str(e)}), 500


"""
routes/security.py - Security system routes
"""

from flask import Blueprint, jsonify, request, current_app
import logging

logger = logging.getLogger(__name__)

security_bp = Blueprint('security', __name__)


@security_bp.route('/security/alarm', methods=['GET', 'POST'])
def alarm_status():
    """Handle alarm status GET/POST operations"""
    db = current_app.postgres_handler
    
    try:
        if request.method == 'GET':
            # Get last alarm status
            query = """
                SELECT status, timestamp 
                FROM alarms_status 
                ORDER BY timestamp DESC 
                LIMIT 1;
            """
            result = db.execute_query(query, fetch_one=True)

            if result:
                return jsonify(dict(result))
            else:
                return jsonify({'status': False, 'timestamp': None})

        elif request.method == 'POST':
            # Update alarm status
            data = request.get_json()

            if 'status' not in data:
                return jsonify({'error': 'Missing "status" field in request body'}), 400

            status = data['status']

            # Clear existing statuses and insert new one
            delete_query = "DELETE FROM alarms_status;"
            db.execute_query(delete_query)

            insert_query = "INSERT INTO alarms_status (status) VALUES (%s);"
            db.execute_query(insert_query, (status,))

            return jsonify({'message': 'Alarm status updated successfully'}), 201

    except Exception as e:
        logger.error(f"Error in alarm_status: {e}")
        return jsonify({'error': f'An error occurred: {e}'}), 500


"""
routes/todo.py - Todo list routes
"""

from flask import Blueprint, jsonify, request, current_app
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

todo_bp = Blueprint('todo', __name__)


@todo_bp.route('/todolist/insert', methods=['POST'])
def insert_documents():
    """Add item to todo list"""
    try:
        documents = request.json
        db_handler = current_app.mongo_handler
        
        result_id = db_handler.add_shopping_item(
            documents['item_name'], 
            documents['quantity'], 
            documents['store'], 
            documents['timestamp']
        )
        
        return jsonify({
            "message": "Documents inserted successfully",
            "id": result_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error inserting todo item: {e}")
        return jsonify({"message": f"Error inserting item: {e}"}), 500


@todo_bp.route('/todolist/today')
def get_documents_today():
    """Get today's todo items"""
    try:
        db_handler = current_app.mongo_handler
        documents = db_handler.read_today_items()
        
        return jsonify(documents)
        
    except Exception as e:
        logger.error(f"Error getting today's items: {e}")
        return jsonify({"message": f"Error getting items: {e}"}), 500


@todo_bp.route('/todolist/delete/<item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Delete item from todo list"""
    try:
        if not ObjectId.is_valid(item_id):
            return jsonify({"message": "Invalid item ID"}), 400

        db_handler = current_app.mongo_handler
        result = db_handler.delete_item(item_id)

        if result.get("deleted_count", 0) > 0:
            return jsonify(result)
        else:
            return jsonify(result), 404

    except Exception as e:
        logger.error(f"Error deleting item {item_id}: {e}")
        return jsonify({"message": f"Error deleting item: {e}"}), 500


@todo_bp.route('/todolist/update/<start_timestamp>/<end_timestamp>')
def search_by_timestamp(start_timestamp, end_timestamp):
    """Search todo items by timestamp range"""
    try:
        db_handler = current_app.mongo_handler
        documents = db_handler.range_timestamp(start_timestamp, end_timestamp)
        
        if not documents:
            return jsonify({"message": "No items found"}), 404
        
        return jsonify(documents)
        
    except Exception as e:
        logger.error(f"Error searching by timestamp: {e}")
        return jsonify({"message": f"Error: {e}"}), 500


"""
routes/system.py - System management routes
"""

from flask import Blueprint, jsonify, request, current_app
import subprocess
import os
import paramiko
from io import StringIO
import logging

logger = logging.getLogger(__name__)

system_bp = Blueprint('system', __name__)


@system_bp.route('/run_backup', methods=['POST'])
def run_backup():
    """Execute backup script and send email notification"""
    try:
        backup_script_path = current_app.config['BACKUP_SCRIPT_PATH']

        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Backup file not found'}), 404

        # Execute backup
        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        
        logger.info(f'Backup output: {result.stdout}')
        if result.stderr:
            logger.error(f'Backup errors: {result.stderr}')

        if result.returncode == 0:
            # Send email notification
            email_service = current_app.email_service
            email_service.send_backup_notification()
            
            return jsonify({
                'message': 'Backup executed successfully',
                'output': result.stdout
            })
        else:
            return jsonify({
                'error': 'Error during backup execution',
                'output': result.stderr
            }), 500
            
    except Exception as e:
        logger.error(f"Backup error: {e}")
        return jsonify({'error': f'An error occurred: {e}'}), 500


@system_bp.route('/ssh_exec', methods=['POST'])
def ssh_exec():
    """Execute SSH command on remote system"""
    try:
        data = request.get_json()
        private_key_str = data.get('privateKey')
        command = data.get('command')
        passphrase = data.get('passphrase') or None

        if not private_key_str or not command:
            return jsonify({"error": "Private key or command missing"}), 400

        config = current_app.config
        HOST_PI = config['HOST_PI']
        PORT_PI = config['PORT_PI']
        USERNAME_PI = config['USERNAME_PI']

        # Parse private key
        key_file = StringIO(private_key_str)
        private_key = None

        key_classes = [paramiko.ECDSAKey, paramiko.RSAKey, paramiko.Ed25519Key, paramiko.DSSKey]
        for key_class in key_classes:
            try:
                key_file.seek(0)
                private_key = key_class.from_private_key(key_file, password=passphrase)
                break
            except paramiko.PasswordRequiredException:
                return jsonify({"error": "This key requires a passphrase"}), 400
            except paramiko.SSHException:
                continue

        if private_key is None:
            return jsonify({"error": "Unsupported key format or corrupted key"}), 400

        # Execute SSH command
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        client.connect(hostname=HOST_PI, port=PORT_PI, username=USERNAME_PI, pkey=private_key)

        stdin, stdout, stderr = client.exec_command(command)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')

        client.close()

        return jsonify({"output": output if output else error})

    except Exception as e:
        logger.error(f"SSH execution error: {e}")
        return jsonify({"error": str(e)}), 500


"""
routes/expenses.py - Expense management routes
"""

from flask import Blueprint, jsonify, request, current_app
import logging

logger = logging.getLogger(__name__)

expenses_bp = Blueprint('expenses', __name__)


@expenses_bp.route('/expenses', methods=['POST', 'GET'])
def manage_expenses():
    """Handle expense operations"""
    sheets_service = current_app.sheets_service
    
    if request.method == 'POST':
        try:
            data = request.get_json()
            description = data.get('description')
            date = data.get('date')
            amount = data.get('amount')
            category = data.get('category')

            if not all([description, date, amount, category]):
                return jsonify({"error": "Missing one or more fields"}), 400

            sheets_service.add_expense(description, date, amount, category)
            return jsonify({"message": "Expense added successfully"}), 201

        except ValueError as ve:
            return jsonify({"error": str(ve)}), 404
        except Exception as e:
            logger.error(f"Error adding expense: {e}")
            return jsonify({"error": str(e)}), 500

    elif request.method == 'GET':
        try:
            summary = sheets_service.get_summary_expenses()
            return jsonify(summary)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 404
        except Exception as e:
            logger.error(f"Error getting expenses summary: {e}")
            return jsonify({"error": str(e)}), 500


@expenses_bp.route('/p48')
def get_p48_value():
    """Get P48 cell value from Google Sheets"""
    try:
        sheets_service = current_app.sheets_service
        
        # Get cached and live values
        cached_value = sheets_service.get_cached_value()
        
        try:
            live_value = sheets_service.get_cell_value_p48()
            live_value = float(live_value.replace(",", ".")) if live_value else None
        except Exception as e:
            logger.warning(f"Failed to get live P48 value: {e}")
            live_value = None

        response = {
            "cached_value": float(cached_value.replace(",", ".")) if cached_value else None,
            "P48_value": live_value
        }
        return jsonify(response)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 404
    except Exception as e:
        logger.error(f"Error getting P48 value: {e}")
        return jsonify({"error": str(e)}), 500


"""
routes/pages.py - Web page routes
"""

from flask import Blueprint, render_template, send_from_directory

pages_bp = Blueprint('pages', __name__)


@pages_bp.route('/favicon.ico')
def favicon():
    """Serve favicon"""
    return send_from_directory('static', 'favicon.ico')


@pages_bp.route('/')
def index():
    """Main dashboard page"""
    return render_template('index.html')


@pages_bp.route('/expenses')
def expenses():
    """Expenses page"""
    return render_template('expenses.html')


@pages_bp.route('/temp')
def temp():
    """Temperature page"""
    return render_template('temperature.html')


@pages_bp.route('/umid')
def umid():
    """Humidity page"""
    return render_template('umid.html')


@pages_bp.route('/train')
def train():
    """Train information page"""
    return render_template('train.html')


@pages_bp.route('/air_quality')
def air_quality():
    """Air quality page"""
    return render_template('air_quality.html')


@pages_bp.route('/raspi')
def raspi():
    """Raspberry Pi stats page"""
    return render_template('raspi.html')


@pages_bp.route('/security')
def security():
    """Security system page"""
    return render_template('security.html')


@pages_bp.route('/lista-spesa')
def get_todolist():
    """Todo list page"""
    return render_template("index-lista.html")