from flask import Blueprint, jsonify, request, send_from_directory
import os
import subprocess
import psutil
import logging
import threading
import shutil
from models.database import handle_db_error
from services.ssh_service import SSHService
from send_email import EmailSender, send_backup_email
from config.settings import get_config
from utils.redis_cache import cache_json_response

system_bp   = Blueprint('system', __name__)
config      = get_config()
ssh_service = SSHService()
logger      = logging.getLogger(__name__)

email_sender = EmailSender(
    config['SMTP_SERVER'], config['SMTP_PORT'],
    config['EMAIL_USERNAME'], config['EMAIL_PASSWORD'],
)

_upgrade_state = {'running': False, 'output': [], 'done': False, 'error': None}

HOST_IP   = config.get('RASPI_HOST_IP',       '127.0.0.1')
HOST_USER = config.get('RASPI_HOST_USER',     'orion')
HOST_PWD  = config.get('RASPI_HOST_PASSWORD', None)
HOST_KEY  = config.get('RASPI_HOST_KEY_PATH', '/run/secrets/id_rsa')
HOST_PORT = int(config.get('RASPI_HOST_SSH_PORT', 2244))   # ← porta di default 2244

ALLOWED_SERVICES = {
    'nginx', 'ssh', 'cron', 'docker',
    'bluetooth', 'avahi-daemon', 'fail2ban',
}


def _ssh_exec_host(command: str, port: int = None) -> tuple:
    """Esegue un comando sul Raspberry Pi via SSH usando la chiave del server.
    
    Args:
        command: Comando da eseguire
        port:    Porta SSH (default: HOST_PORT = 2244)
    """
    effective_port = port if port is not None else HOST_PORT

    key_content = None
    if HOST_KEY and os.path.exists(HOST_KEY):
        with open(HOST_KEY) as f:
            key_content = f.read()
    if not key_content and not HOST_PWD:
        raise RuntimeError("No SSH credentials for host.")
    out = ssh_service.exec_command(
        command,
        private_key_str=key_content,
        username=HOST_USER,
        password=HOST_PWD,
        ip=HOST_IP,
        port=effective_port,
    )
    return out, '', 0


class _SSHResult:
    def __init__(self, stdout='', stderr='', returncode=0):
        self.stdout     = stdout
        self.stderr     = stderr
        self.returncode = returncode


def _run_host_cmd(command: list, port: int = None) -> '_SSHResult':
    binary     = command[0] if command[0] != 'sudo' else (command[1] if len(command) > 1 else '')
    needs_ssh  = binary in ('systemctl', 'journalctl', 'vcgencmd') and not shutil.which(binary)

    if not needs_ssh:
        try:
            r = subprocess.run(command, capture_output=True, text=True, timeout=15)
            return _SSHResult(r.stdout, r.stderr, r.returncode)
        except FileNotFoundError:
            needs_ssh = True

    if needs_ssh:
        cmd_str = ' '.join(command)
        stdout, stderr, rc = _ssh_exec_host(cmd_str, port=port)
        return _SSHResult(stdout or '', stderr or '', rc)

    raise RuntimeError(f"Cannot execute: {' '.join(command)}")


def _format_uptime(seconds: float) -> str:
    seconds = int(seconds)
    days, rem  = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    mins, secs = divmod(rem, 60)
    parts = []
    if days:  parts.append(f'{days}d')
    if hours: parts.append(f'{hours}h')
    if mins:  parts.append(f'{mins}m')
    parts.append(f'{secs}s')
    return ' '.join(parts)


def _systemctl_status(service: str) -> dict:
    try:
        active  = _run_host_cmd(['systemctl', 'is-active',  service]).stdout.strip()
        enabled = _run_host_cmd(['systemctl', 'is-enabled', service]).stdout.strip()
    except Exception as e:
        logger.warning(f"systemctl status {service}: {e}")
        active, enabled = 'unknown', 'unknown'
    return {
        'service':  service,
        'active':   active,
        'enabled':  enabled,
        'isActive': active == 'active',
    }


def _parse_throttle_flags(value: int) -> list:
    FLAGS = {
        0x1:     'Under-voltage detected',
        0x2:     'Arm frequency capped',
        0x4:     'Currently throttled',
        0x8:     'Soft temperature limit active',
        0x10000: 'Under-voltage has occurred',
        0x20000: 'Arm frequency capping has occurred',
        0x40000: 'Throttling has occurred',
        0x80000: 'Soft temperature limit has occurred',
    }
    return [label for bit, label in FLAGS.items() if value & bit]


def _validate_port(value, default: int = None) -> int:
    """Valida e converte un valore in numero di porta TCP valido."""
    try:
        p = int(value)
        if 1 <= p <= 65535:
            return p
    except (TypeError, ValueError):
        pass
    return default if default is not None else HOST_PORT


# ── Stats ──────────────────────────────────────────────────
@system_bp.route('/api_raspberry_pi_stats')
@handle_db_error
@cache_json_response(ttl_seconds=10)
def api_raspi_stats():
    try:
        try:
            with open('/sys/class/thermal/thermal_zone0/temp') as f:
                temperature = float(f.read().strip()) / 1000.0
        except FileNotFoundError:
            temperature = None

        cpu_usage = psutil.cpu_percent(interval=1)
        memory    = psutil.virtual_memory()
        disk      = psutil.disk_usage('/')

        try:
            with open('/proc/uptime') as f:
                uptime_str = _format_uptime(float(f.read().split()[0]))
        except Exception:
            uptime_str = None

        try:
            load1, load5, load15 = os.getloadavg()
            load_avg = {'1m': round(load1, 2), '5m': round(load5, 2), '15m': round(load15, 2)}
        except Exception:
            load_avg = None

        return jsonify({
            'temperature': temperature,
            'cpuUsage':    cpu_usage,
            'memoryUsed':  f'{memory.used  / (1024**3):.2f} GB',
            'memoryTotal': f'{memory.total / (1024**3):.2f} GB',
            'diskUsed':    f'{disk.used    / (1024**3):.2f} GB',
            'diskTotal':   f'{disk.total   / (1024**3):.2f} GB',
            'diskFree':    f'{disk.free    / (1024**3):.2f} GB',
            'uptime':      uptime_str,
            'loadAvg':     load_avg,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Backup ─────────────────────────────────────────────────
@system_bp.route('/api_run_backup', methods=['POST'])
@handle_db_error
def api_run_backup():
    try:
        backup_script_path = '/usr/local/bin/backup.sh'
        if not os.path.exists(backup_script_path):
            return jsonify({'error': 'Backup script not found.'}), 404
        result = subprocess.run([backup_script_path], capture_output=True, text=True)
        if result.returncode == 0:
            backup_file_path = result.stdout.strip().split('\n')[-1]
            send_backup_email(email_sender, backup_file_path)
            return jsonify({'message': 'Backup completed', 'output': result.stdout}), 200
        return jsonify({'error': 'Backup error', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── SSH exec ───────────────────────────────────────────────
@system_bp.route('/api/ssh_exec', methods=['POST'])
@handle_db_error
def api_ssh_exec():
    data        = request.get_json()
    private_key = data.get('privateKey')
    command     = data.get('command')
    passphrase  = data.get('passphrase') or None
    username    = data.get('username')   or None
    password    = data.get('password')   or None
    ip          = data.get('ip')         or None
    port        = _validate_port(data.get('port'), default=HOST_PORT)

    if (not private_key and not password) or not command:
        return jsonify({'error': 'Missing authentication method or command'}), 400
    try:
        out = ssh_service.exec_command(
            command,
            private_key_str=private_key,
            passphrase=passphrase,
            username=username,
            password=password,
            ip=ip,
            port=port,
        )
        return jsonify({'output': out})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@system_bp.route('/api/ssh_exec_host', methods=['POST'])
@handle_db_error
def api_ssh_exec_host():
    data    = request.get_json() or {}
    command = data.get('command', '').strip()
    port    = _validate_port(data.get('port'), default=HOST_PORT)

    if not command:
        return jsonify({'error': 'Missing command'}), 400
    try:
        stdout, stderr, rc = _ssh_exec_host(command, port=port)
        return jsonify({'output': stdout or stderr or '(no output)'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Power ──────────────────────────────────────────────────
@system_bp.route('/api/system/reboot', methods=['POST'])
@handle_db_error
def api_reboot():
    try:
        logger.warning("Reboot requested via API")
        def _do():
            try: _ssh_exec_host('sudo reboot')
            except Exception as e: logger.error(f"Reboot SSH error: {e}")
        threading.Timer(2, _do).start()
        return jsonify({'message': 'Rebooting in 2 seconds…'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/system/shutdown', methods=['POST'])
@handle_db_error
def api_shutdown():
    try:
        logger.warning("Shutdown requested via API")
        def _do():
            try: _ssh_exec_host('sudo shutdown -h now')
            except Exception as e: logger.error(f"Shutdown SSH error: {e}")
        threading.Timer(2, _do).start()
        return jsonify({'message': 'Shutting down in 2 seconds…'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/system/throttle')
@handle_db_error
@cache_json_response(ttl_seconds=15)
def api_throttle():
    try:
        r   = _run_host_cmd(['vcgencmd', 'get_throttled'])
        raw = (r.stdout or '').strip()
        if not raw:
            return jsonify({'error': 'Empty vcgencmd response'}), 502
        value = int(raw.split('=')[1], 16) if '=' in raw else None
        flags = _parse_throttle_flags(value) if value is not None else []
        return jsonify({'raw': raw, 'value': value, 'flags': flags, 'ok': value == 0})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Services ───────────────────────────────────────────────
@system_bp.route('/api/services')
@handle_db_error
@cache_json_response(ttl_seconds=30)
def api_services():
    services, errors = [], []
    for svc in sorted(ALLOWED_SERVICES):
        try:
            services.append(_systemctl_status(svc))
        except Exception as e:
            errors.append({
                'service': svc, 'active': 'error', 'enabled': 'error',
                'isActive': False, 'error': str(e),
            })
    return jsonify({
        'services':    services + errors,
        'sshFallback': True,
        'host':        HOST_IP,
        'sshPort':     HOST_PORT,
    })


@system_bp.route('/api/services/<service>/action', methods=['POST'])
@handle_db_error
def api_service_action(service):
    if service not in ALLOWED_SERVICES:
        return jsonify({'error': f'Service "{service}" not in whitelist'}), 403
    data   = request.get_json() or {}
    action = data.get('action', '').lower()
    if action not in {'start', 'stop', 'restart'}:
        return jsonify({'error': 'action must be start | stop | restart'}), 400
    try:
        result = _run_host_cmd(['sudo', 'systemctl', action, service])
        if result.returncode != 0:
            return jsonify({'error': (result.stderr or '').strip() or 'systemctl failed'}), 500
        return jsonify({'message': f'{service} {action}ed', **_systemctl_status(service)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Processes ──────────────────────────────────────────────
@system_bp.route('/api/processes')
@handle_db_error
@cache_json_response(ttl_seconds=15)
def api_processes():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
        try:
            i = p.info
            procs.append({
                'pid':    i['pid'],
                'name':   i['name'],
                'cpu':    round(i['cpu_percent']    or 0, 1),
                'mem':    round(i['memory_percent'] or 0, 1),
                'status': i['status'],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x['cpu'], reverse=True)
    return jsonify(procs[:15])


@system_bp.route('/api/processes/<int:pid>/kill', methods=['POST'])
@handle_db_error
def api_kill_process(pid):
    PROTECTED = {1, os.getpid()}
    if pid in PROTECTED:
        return jsonify({'error': 'Cannot kill protected process'}), 403
    try:
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()
        return jsonify({'message': f'Process {pid} ({name}) terminated'})
    except psutil.NoSuchProcess:
        return jsonify({'error': f'PID {pid} not found'}), 404
    except psutil.AccessDenied:
        return jsonify({'error': f'Permission denied for PID {pid}'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Network ────────────────────────────────────────────────
@system_bp.route('/api/network')
@handle_db_error
@cache_json_response(ttl_seconds=15)
def api_network():
    counters  = psutil.net_io_counters(pernic=True)
    addrs     = psutil.net_if_addrs()
    stats_map = psutil.net_if_stats()
    result    = []
    for iface, counter in counters.items():
        ips = [a.address for a in addrs.get(iface, []) if ':' not in a.address and a.address]
        up  = stats_map.get(iface)
        result.append({
            'interface': iface,
            'ip':        ips[0] if ips else None,
            'isUp':      up.isup if up else False,
            'bytesSent': counter.bytes_sent,
            'bytesRecv': counter.bytes_recv,
            'mbSent':    round(counter.bytes_sent / (1024 ** 2), 2),
            'mbRecv':    round(counter.bytes_recv / (1024 ** 2), 2),
        })
    result.sort(key=lambda x: x['bytesRecv'], reverse=True)
    return jsonify(result)


# ── Logs ───────────────────────────────────────────────────
@system_bp.route('/api/logs/system')
@handle_db_error
@cache_json_response(ttl_seconds=20)
def api_logs_system():
    lines = min(int(request.args.get('lines', 50)), 200)
    try:
        r = _run_host_cmd(['journalctl', '-n', str(lines), '--no-pager', '-o', 'short-iso'])
        return jsonify({'lines': (r.stdout or '').splitlines(), 'source': 'host'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/logs/auth')
@handle_db_error
@cache_json_response(ttl_seconds=20)
def api_logs_auth():
    try:
        r = _run_host_cmd(['journalctl', '-u', 'ssh', '-n', '30', '--no-pager', '-o', 'short-iso'])
        if (r.stdout or '').strip():
            return jsonify({'lines': r.stdout.splitlines(), 'source': 'host'})
        with open('/var/log/auth.log') as f:
            return jsonify({'lines': [l.rstrip() for l in f.readlines()[-30:]], 'source': 'local'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── APT Upgrade ────────────────────────────────────────────
@system_bp.route('/api/system/upgrade/start', methods=['POST'])
@handle_db_error
def api_upgrade_start():
    global _upgrade_state
    if _upgrade_state['running']:
        return jsonify({'error': 'Upgrade already running'}), 409

    _upgrade_state = {'running': True, 'output': [], 'done': False, 'error': None}

    def run():
        global _upgrade_state
        try:
            for cmd in [
                ['sudo', 'apt-get', 'update', '-y'],
                ['sudo', 'apt-get', 'upgrade', '-y'],
            ]:
                _upgrade_state['output'].append(f'$ {" ".join(cmd)}')
                try:
                    stdout, _, _ = _ssh_exec_host(' '.join(cmd))
                    _upgrade_state['output'].extend((stdout or '').splitlines())
                except Exception as e:
                    _upgrade_state['error'] = str(e)
                    break
        except Exception as e:
            _upgrade_state['error'] = str(e)
        finally:
            _upgrade_state['running'] = False
            _upgrade_state['done']    = True

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'message': 'Upgrade started'}), 202


@system_bp.route('/api/system/upgrade/status')
@handle_db_error
@cache_json_response(ttl_seconds=5)
def api_upgrade_status():
    return jsonify(_upgrade_state)