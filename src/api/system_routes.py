from flask import Blueprint, jsonify, request, render_template, send_from_directory
import os
import subprocess
import psutil
import logging
from models.database import handle_db_error
from services.ssh_service import SSHService
from send_email import EmailSender, invia_backup_email
from config.settings import get_config

system_bp = Blueprint('system', __name__)
config = get_config()
ssh_service = SSHService()
logger = logging.getLogger(__name__)

# Email sender
email_sender = EmailSender(
    config['SMTP_SERVER'],
    config['SMTP_PORT'],
    config['EMAIL_USERNAME'],
    config['EMAIL_PASSWORD']
)

@system_bp.route('/favicon.ico')
def favicon():
    """Serve il favicon"""
    return send_from_directory('static', 'favicon.ico')

@system_bp.route('/api_raspberry_pi_stats')
@handle_db_error
def api_raspi_stats():
    """API per statistiche del Raspberry Pi"""
    try:
        # Temperatura CPU
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp_str = f.read().strip()
                temperature = float(temp_str) / 1000.0
        except FileNotFoundError:
            temperature = None
        
        # Statistiche sistema
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        stats = {
            'temperature': temperature,
            'cpuUsage': cpu_usage,
            'memoryUsed': f'{memory.used / (1024**3):.2f} GB',
            'memoryTotal': f'{memory.total / (1024**3):.2f} GB',
            'diskUsed': f'{disk.used / (1024**3):.2f} GB',
            'diskTotal': f'{disk.total / (1024**3):.2f} GB',
            'diskFree': f'{disk.free / (1024**3):.2f} GB'
        }
        return jsonify(stats)
    except FileNotFoundError:
        return jsonify({'error': 'File temperatura non trovato.'}), 404

@system_bp.route('/api_run_backup', methods=['POST'])
@handle_db_error
def api_run_backup():
    """API per eseguire il backup del sistema"""
    try:
        backup_script_path = '/usr/local/bin/backup.sh'
        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Backup script not found.'}), 404
        
        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        logger.info(f"Backup stdout: {result.stdout}")
        logger.info(f"Backup stderr: {result.stderr}")
        
        if result.returncode == 0:
            invia_backup_email(email_sender)
            return jsonify({'message': 'Backup eseguito', 'output': result.stdout}), 200
        
        return jsonify({'error': 'Errore backup', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@system_bp.route('/api/ssh_exec', methods=['POST'])
@handle_db_error
def api_ssh_exec():
    """API per eseguire comandi SSH remoti"""
    data = request.get_json()
    private_key = data.get('privateKey')
    command = data.get('command')
    passphrase = data.get('passphrase') or None
    
    if not private_key or not command:
        return jsonify({"error": "Chiave privata o comando mancante"}), 400
    
    try:
        out = ssh_service.exec_command(private_key, command, passphrase)
        return jsonify({"output": out})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@system_bp.route('/raspi')
def page_raspi():
    """Pagina per visualizzare statistiche Raspberry Pi"""
    return render_template('raspi.html')