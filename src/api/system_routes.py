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

# Email sender initialization
email_sender = EmailSender(
    config['SMTP_SERVER'],
    config['SMTP_PORT'],
    config['EMAIL_USERNAME'],
    config['EMAIL_PASSWORD']
)


@system_bp.route('/favicon.ico')
def favicon():
    """Serve the favicon.ico file."""
    return send_from_directory('static', 'favicon.ico')


@system_bp.route('/api_raspberry_pi_stats')
@handle_db_error
def api_raspi_stats():
    """API to get Raspberry Pi system statistics."""
    try:
        # CPU temperature
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp_str = f.read().strip()
                temperature = float(temp_str) / 1000.0
        except FileNotFoundError:
            temperature = None

        # System stats
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
        return jsonify({'error': 'Temperature file not found.'}), 404


@system_bp.route('/api_run_backup', methods=['POST'])
@handle_db_error
def api_run_backup():
    """API to run system backup."""
    try:
        backup_script_path = '/usr/local/bin/backup.sh'
        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Backup script not found.'}), 404

        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        if result.stdout.strip():
            logger.info(f"Backup stdout: {result.stdout.strip()}")

        if result.stderr.strip():
            logger.error(f"Backup stderr: {result.stderr.strip()}")


        if result.returncode == 0:
            backup_file_path = result.stdout.strip().split("\n")[-1]
            invia_backup_email(email_sender, backup_file_path)
            return jsonify({'message': 'Backup completed', 'output': result.stdout}), 200

        return jsonify({'error': 'Backup error', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/ssh_exec', methods=['POST'])
@handle_db_error
def api_ssh_exec():
    """API to execute remote SSH commands."""
    data = request.get_json()
    private_key = data.get('privateKey')
    command = data.get('command')
    passphrase = data.get('passphrase') or None
    username = data.get('username') or None
    password = data.get('password') or None
    ip = data.get('ip') or None

    if (not private_key and not password) or not command:
        return jsonify({"error": "Missing authentication method or command"}), 400

    try:
        out = ssh_service.exec_command(
            command,
            private_key_str=private_key,
            passphrase=passphrase,
            username=username,
            password=password,
            ip=ip
        )
        return jsonify({"output": out})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@system_bp.route('/raspi')
def page_raspi():
    """Page to display Raspberry Pi statistics."""
    return render_template('raspi.html')