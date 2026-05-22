from flask import Blueprint, jsonify, request, send_from_directory
import os
import subprocess
import psutil
import logging
import threading
import shutil
from datetime import datetime
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
_nextcloud_state = {'running': False, 'output': [], 'done': False, 'error': None}
_full_upgrade_state = {
    'running': False,
    'output': [],
    'done': False,
    'error': None,
    'step': '',
    'progress': 0,
    'total_steps': 8,
    'start_time': None,
    'end_time': None,
}
_maintenance_state = {
    'running': False,
    'output': [],
    'done': False,
    'error': None,
    'action': '',
}

HOST_IP   = config.get('RASPI_HOST_IP',       '127.0.0.1')
HOST_USER = config.get('RASPI_HOST_USER',     'orion')
HOST_PWD  = config.get('RASPI_HOST_PASSWORD', None)
HOST_KEY  = config.get('RASPI_HOST_KEY_PATH', '/run/secrets/id_rsa')
HOST_PORT = int(config.get('RASPI_HOST_SSH_PORT', 2244))   # ← default port 2244

ALLOWED_SERVICES = {
    'nginx', 'ssh', 'cron', 'docker',
    'bluetooth', 'avahi-daemon', 'fail2ban',
}


def _ssh_exec_host(command: str, port: int = None, timeout: int = 60) -> tuple:
    
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
        timeout=timeout,        # forwarded
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
    """Validate and convert a value to a valid TCP port number."""
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
            timeout=timeout,        # forwarded
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



# ══════════════════════════════════════════════════════════════════════════════
# FULL SYSTEM UPGRADE
# ══════════════════════════════════════════════════════════════════════════════
 
@system_bp.route('/api/system/full_upgrade/start', methods=['POST'])
def api_full_upgrade_start():
    """
    Start a complete and safe system upgrade:
    1. Pre-check (disk space, connection)
    2. Package list backup
    3. apt update
    4. apt full-upgrade
    5. apt autoremove
    6. apt autoclean
    7. Firmware update (rpi-update)
    8. Post-check and report
    """
    global _full_upgrade_state
    
    if _full_upgrade_state['running']:
        return jsonify({'error': 'Full upgrade already running'}), 409
    
    # Reset state
    _full_upgrade_state = {
        'running': True,
        'output': [],
        'done': False,
        'error': None,
        'step': 'Initialization',
        'progress': 0,
        'total_steps': 8,
        'start_time': datetime.now().isoformat(),
        'end_time': None
    }
    
    def run_full_upgrade():
        global _full_upgrade_state
        
        def log(msg):
            _full_upgrade_state['output'].append(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')
            logger.info(f'FullUpgrade: {msg}')
        
        def update_progress(step, step_num):
            _full_upgrade_state['step'] = step
            _full_upgrade_state['progress'] = int((step_num / _full_upgrade_state['total_steps']) * 100)
        
        try:
            # ─────────────────────────────────────────────────────────────────
            # STEP 1: Pre-check
            # ─────────────────────────────────────────────────────────────────
            update_progress('System pre-check', 1)
            log('═══ STEP 1/8: Pre-check ═══')
            
            # Check disk space
            stdout, stderr, rc = _ssh_exec_host("df -h / | tail -1 | awk '{print $5}'")
            if rc == 0:
                disk_usage = stdout.strip().replace('%', '')
                log(f'Disk space used: {disk_usage}%')
                if int(disk_usage) > 85:
                    log('⚠️  WARNING: Disk almost full, proceed with caution')
            
            # Check internet connection
            stdout, stderr, rc = _ssh_exec_host('ping -c 2 8.8.8.8 > /dev/null 2>&1 && echo OK || echo FAIL')
            if 'OK' in stdout:
                log('✓ Internet connection OK')
            else:
                raise Exception('No internet connection')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 2: Package list backup
            # ─────────────────────────────────────────────────────────────────
            update_progress('Package list backup', 2)
            log('═══ STEP 2/8: Package backup ═══')
            
            backup_cmd = f"dpkg --get-selections > /tmp/package-backup-$(date +%Y%m%d-%H%M%S).txt"
            stdout, stderr, rc = _ssh_exec_host(backup_cmd)
            if rc == 0:
                log('✓ Package list saved in /tmp/')
            else:
                log(f'⚠️  Warning: Backup failed - {stderr}')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 3: apt update
            # ─────────────────────────────────────────────────────────────────
            update_progress('Repository update', 3)
            log('═══ STEP 3/8: apt update ═══')
            
            stdout, stderr, rc = _ssh_exec_host('sudo apt-get update', timeout=180)
            log(stdout if stdout else stderr)
            if rc != 0:
                raise Exception(f'apt update failed: {stderr}')
            log('✓ Repositories updated')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 4: apt full-upgrade
            # ─────────────────────────────────────────────────────────────────
            update_progress('Package upgrade', 4)
            log('═══ STEP 4/8: apt full-upgrade ═══')
            
            stdout, stderr, rc = _ssh_exec_host(
                'sudo DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"',
                timeout=600
            )
            log(stdout if stdout else stderr)
            if rc != 0:
                raise Exception(f'apt full-upgrade failed: {stderr}')
            log('✓ Packages updated')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 5: apt autoremove
            # ─────────────────────────────────────────────────────────────────
            update_progress('Remove obsolete packages', 5)
            log('═══ STEP 5/8: apt autoremove ═══')
            
            stdout, stderr, rc = _ssh_exec_host('sudo apt-get autoremove -y', timeout=180)
            log(stdout if stdout else stderr)
            if rc == 0:
                log('✓ Obsolete packages removed')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 6: apt autoclean
            # ─────────────────────────────────────────────────────────────────
            update_progress('Cache cleanup', 6)
            log('═══ STEP 6/8: apt autoclean ═══')
            
            stdout, stderr, rc = _ssh_exec_host('sudo apt-get autoclean -y', timeout=120)
            log(stdout if stdout else stderr)
            if rc == 0:
                log('✓ Cache cleaned')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 7: Firmware update (optional, Raspberry Pi only)
            # ─────────────────────────────────────────────────────────────────
            update_progress('Firmware verification', 7)
            log('═══ STEP 7/8: Firmware check ═══')
            
            # Check if rpi-update is available
            stdout, stderr, rc = _ssh_exec_host('which rpi-update')
            if rc == 0:
                log('rpi-update found, checking firmware...')
                # We do not run rpi-update automatically for safety reasons
                log('ℹ️  Firmware update available but not executed automatically')
                log('   Run manually: sudo rpi-update')
            else:
                log('ℹ️  rpi-update not available on this system')
            
            # ─────────────────────────────────────────────────────────────────
            # STEP 8: Post-check and final report
            # ─────────────────────────────────────────────────────────────────
            update_progress('Final report', 8)
            log('═══ STEP 8/8: Post-check ═══')
            
            # Check for broken packages
            stdout, stderr, rc = _ssh_exec_host('dpkg --audit')
            if stdout.strip():
                log(f'⚠️  Broken packages:\n{stdout}')
            else:
                log('✓ No broken packages')
            
            # Check freed space
            stdout, stderr, rc = _ssh_exec_host("df -h / | tail -1 | awk '{print $5}'")
            if rc == 0:
                disk_usage = stdout.strip().replace('%', '')
                log(f'Disk space after upgrade: {disk_usage}%')
            
            # Check if reboot is required
            stdout, stderr, rc = _ssh_exec_host('[ -f /var/run/reboot-required ] && echo YES || echo NO')
            if 'YES' in stdout:
                log('⚠️  REBOOT REQUIRED to complete upgrade')
            else:
                log('✓ No reboot required')
            
            log('═══ UPGRADE COMPLETED SUCCESSFULLY ═══')
            
        except Exception as e:
            _full_upgrade_state['error'] = str(e)
            log(f'❌ ERROR: {str(e)}')
        finally:
            _full_upgrade_state['running'] = False
            _full_upgrade_state['done'] = True
            _full_upgrade_state['end_time'] = datetime.now().isoformat()
            
            # Calculate duration
            if _full_upgrade_state['start_time']:
                start = datetime.fromisoformat(_full_upgrade_state['start_time'])
                end = datetime.fromisoformat(_full_upgrade_state['end_time'])
                duration = (end - start).total_seconds()
                log(f'Total duration: {int(duration // 60)}m {int(duration % 60)}s')
    
    # Launch thread
    threading.Thread(target=run_full_upgrade, daemon=True).start()
    return jsonify({'message': 'Full upgrade started'}), 202
 
 
@system_bp.route('/api/system/full_upgrade/status')
def api_full_upgrade_status():
    """Returns the state of the full upgrade"""
    return jsonify(_full_upgrade_state)
 
 
# ══════════════════════════════════════════════════════════════════════════════
# MAINTENANCE COMMANDS
# ══════════════════════════════════════════════════════════════════════════════
 
@system_bp.route('/api/system/maintenance/fix_broken', methods=['POST'])
def api_fix_broken():
    """
    Fix broken packages:
    - dpkg --configure -a
    - apt-get install -f
    """
    global _maintenance_state
    
    if _maintenance_state['running']:
        return jsonify({'error': 'Maintenance operation already running'}), 409
    
    _maintenance_state = {
        'running': True,
        'output': [],
        'done': False,
        'error': None,
        'action': 'fix_broken'
    }
    
    def run():
        global _maintenance_state
        try:
            _maintenance_state['output'].append('═══ Fixing broken packages ═══')
            
            # dpkg --configure -a
            _maintenance_state['output'].append('$ sudo dpkg --configure -a')
            stdout, stderr, rc = _ssh_exec_host('sudo dpkg --configure -a', timeout=300)
            _maintenance_state['output'].append(stdout if stdout else stderr)
            
            # apt-get install -f
            _maintenance_state['output'].append('$ sudo apt-get install -f -y')
            stdout, stderr, rc = _ssh_exec_host('sudo apt-get install -f -y', timeout=300)
            _maintenance_state['output'].append(stdout if stdout else stderr)
            
            if rc == 0:
                _maintenance_state['output'].append('✓ Repair completed')
            else:
                raise Exception('Error during repair')
                
        except Exception as e:
            _maintenance_state['error'] = str(e)
        finally:
            _maintenance_state['running'] = False
            _maintenance_state['done'] = True
    
    threading.Thread(target=run, daemon=True).start()
    return jsonify({'message': 'Repair started'}), 202
 
 
@system_bp.route('/api/system/maintenance/clean_all', methods=['POST'])
def api_clean_all():
    """
    Full system cleanup:
    - apt-get clean
    - apt-get autoclean
    - apt-get autoremove
    - Clean old logs
    - Clean thumbnail cache
    """
    global _maintenance_state
    
    if _maintenance_state['running']:
        return jsonify({'error': 'Maintenance operation already running'}), 409
    
    _maintenance_state = {
        'running': True,
        'output': [],
        'done': False,
        'error': None,
        'action': 'clean_all'
    }
    
    def run():
        global _maintenance_state
        try:
            _maintenance_state['output'].append('═══ Full system cleanup ═══')
            
            commands = [
                ('apt-get clean', 'sudo apt-get clean'),
                ('apt-get autoclean', 'sudo apt-get autoclean -y'),
                ('apt-get autoremove', 'sudo apt-get autoremove -y --purge'),
                ('Clean old logs', 'sudo journalctl --vacuum-time=7d'),
                ('Clean thumbnail cache', 'rm -rf ~/.cache/thumbnails/*'),
            ]
            
            for label, cmd in commands:
                _maintenance_state['output'].append(f'\n$ {cmd}')
                stdout, stderr, rc = _ssh_exec_host(cmd, timeout=180)
                _maintenance_state['output'].append(stdout if stdout else stderr)
                if rc == 0:
                    _maintenance_state['output'].append(f'✓ {label} completed')
            
            # Report freed space
            stdout, stderr, rc = _ssh_exec_host("df -h / | tail -1")
            _maintenance_state['output'].append(f'\nDisk space:\n{stdout}')
            
            _maintenance_state['output'].append('\n✓ Cleanup completed successfully')
            
        except Exception as e:
            _maintenance_state['error'] = str(e)
        finally:
            _maintenance_state['running'] = False
            _maintenance_state['done'] = True
    
    threading.Thread(target=run, daemon=True).start()
    return jsonify({'message': 'Cleanup started'}), 202
 
 
@system_bp.route('/api/system/maintenance/status')
def api_maintenance_status():
    """Returns the state of maintenance operations"""
    return jsonify(_maintenance_state)
 
 
@system_bp.route('/api/system/disk_usage')
def api_disk_usage():
    """
    Detailed disk usage analysis
    """
    try:
        output = {
            'summary': {},
            'top_directories': [],
            'apt_cache_size': None,
            'log_size': None
        }
        
        # General summary
        stdout, stderr, rc = _ssh_exec_host("df -h /")
        if rc == 0:
            output['summary']['raw'] = stdout
        
        # Top directories
        stdout, stderr, rc = _ssh_exec_host(
            "sudo du -h --max-depth=1 / 2>/dev/null | sort -rh | head -10",
            timeout=60
        )
        if rc == 0:
            output['top_directories'] = stdout.splitlines()
        
        # APT cache size
        stdout, stderr, rc = _ssh_exec_host("sudo du -sh /var/cache/apt/archives 2>/dev/null")
        if rc == 0:
            output['apt_cache_size'] = stdout.strip()
        
        # Log size
        stdout, stderr, rc = _ssh_exec_host("sudo du -sh /var/log 2>/dev/null")
        if rc == 0:
            output['log_size'] = stdout.strip()
        
        return jsonify(output)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
 
 
@system_bp.route('/api/system/package_info')
def api_package_info():
    """
    Information about installed and available packages
    """
    try:
        output = {}
        
        # Installed packages
        stdout, stderr, rc = _ssh_exec_host("dpkg -l | wc -l")
        if rc == 0:
            output['installed_count'] = stdout.strip()
        
        # Upgradable packages
        stdout, stderr, rc = _ssh_exec_host(
            "apt list --upgradable 2>/dev/null | grep -v 'Listing' | wc -l"
        )
        if rc == 0:
            output['upgradable_count'] = stdout.strip()
        
        # Autoremovable packages
        stdout, stderr, rc = _ssh_exec_host(
            "apt-get autoremove --dry-run 2>/dev/null | grep 'will be removed' | awk '{print $1}'"
        )
        if rc == 0:
            output['autoremovable_count'] = stdout.strip()
        
        # List of upgradable packages
        stdout, stderr, rc = _ssh_exec_host(
            "apt list --upgradable 2>/dev/null | grep -v 'Listing' | head -20"
        )
        if rc == 0:
            output['upgradable_list'] = stdout.splitlines()
        
        return jsonify(output)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
 
 
@system_bp.route('/api/system/check_reboot_required')
def api_check_reboot_required():
    """
    Check if a reboot is required
    """
    try:
        stdout, stderr, rc = _ssh_exec_host('[ -f /var/run/reboot-required ] && cat /var/run/reboot-required || echo "No reboot required"')
        
        required = 'reboot' in stdout.lower() and 'no reboot' not in stdout.lower()
        
        return jsonify({
            'required': required,
            'message': stdout.strip(),
            'file_exists': rc == 0 and 'No reboot' not in stdout
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# NEXTCLOUD UPDATE
# ══════════════════════════════════════════════════════════════════════════════

# ── 1. Stato iniziale (sostituisce la definizione a livello modulo) ────────────
_nextcloud_state = {
    'running':     False,
    'output':      [],
    'done':        False,
    'error':       None,
    'step':        '',
    'progress':    0,
    'total_steps': 8,
    'start_time':  None,
    'end_time':    None,
}


# ── 2. Route start ─────────────────────────────────────────────────────────────
@system_bp.route('/api/system/nextcloud_update/start', methods=['POST'])
@handle_db_error
def api_nextcloud_update_start():
    """
    Aggiornamento Nextcloud via Docker Compose in 8 step con tracking avanzamento:
      1. Pre-check (docker running, container raggiungibile)
      2. Maintenance mode ON
      3. Backup database (MariaDB dump → /tmp)
      4. Backup volume dati (tar.gz)
      5. Pull nuove immagini
      6. Recreate container (up -d --force-recreate)
      7. occ upgrade
      8. Maintenance mode OFF + status check
    In caso di errore ai passi 3-8 il maintenance mode viene riattivato/lasciato
    attivo e viene riportato l'errore senza forzare uno stato inconsistente.
    """
    global _nextcloud_state

    if _nextcloud_state['running']:
        return jsonify({'error': 'Nextcloud update already running'}), 409

    data = request.get_json(force=True, silent=True) or {}
    compose_dir    = data.get('compose_dir', '~/nextcloud-docker')
    db_service     = data.get('db_service', 'db')
    app_service    = data.get('app_service', 'nextcloud')
    db_root_pass   = data.get('db_root_pass', 'root_password')
    backup_dir     = data.get('backup_dir', '/tmp/nextcloud-backups')

    _nextcloud_state = {
        'running':     True,
        'output':      [],
        'done':        False,
        'error':       None,
        'step':        'Initializing…',
        'progress':    0,
        'total_steps': 8,
        'start_time':  datetime.now().isoformat(),
        'end_time':    None,
    }

    def log(msg: str):
        _nextcloud_state['output'].append(
            f'[{datetime.now().strftime("%H:%M:%S")}] {msg}'
        )
        logger.info(f'NextcloudUpdate: {msg}')

    def set_step(label: str, n: int):
        _nextcloud_state['step']     = label
        _nextcloud_state['progress'] = int(n / _nextcloud_state['total_steps'] * 100)

    def run_cmd(cmd: str, timeout: int = 120, critical: bool = True):
        """Esegue un comando SSH, logga output e rilancia l'eccezione se critical."""
        log(f'$ {cmd}')
        try:
            stdout, stderr, rc = _ssh_exec_host(cmd, timeout=timeout)
            for line in (stdout or stderr or '').splitlines():
                if line.strip():
                    log(line)
            if rc != 0 and critical:
                raise RuntimeError((stderr or stdout or f'exit code {rc}').strip())
            return stdout or '', rc
        except RuntimeError:
            raise
        except Exception as e:
            if critical:
                raise RuntimeError(str(e)) from e
            log(f'⚠ {e}')
            return '', 1

    def maintenance(on: bool):
        state_str = '--on' if on else '--off'
        run_cmd(
            f'cd {compose_dir} && docker compose exec -T {app_service} '
            f'php /var/www/html/occ maintenance:mode {state_str}',
            timeout=60,
            critical=False,
        )

    def run():
        global _nextcloud_state
        maintenance_was_enabled = False
        try:
            # ── STEP 1: Pre-check ────────────────────────────────────────────
            set_step('Pre-check', 1)
            log('═══ STEP 1/8: Pre-check ═══')

            out, rc = run_cmd('docker info --format "{{.ServerVersion}}"', critical=False)
            if rc != 0:
                raise RuntimeError('Docker daemon non risponde. Controlla che Docker sia in esecuzione.')
            log(f'✓ Docker version: {out.strip()}')

            out, rc = run_cmd(
                f'cd {compose_dir} && docker compose ps --format json 2>/dev/null | head -5',
                critical=False,
            )
            if not out.strip():
                raise RuntimeError(f'Nessun container trovato in {compose_dir}. Verifica compose_dir.')
            log('✓ Container rilevati')

            # ── STEP 2: Maintenance mode ON ──────────────────────────────────
            set_step('Maintenance mode ON', 2)
            log('═══ STEP 2/8: Maintenance mode ON ═══')
            maintenance(on=True)
            maintenance_was_enabled = True
            log('✓ Maintenance mode attivato')

            # ── STEP 3: DB backup ────────────────────────────────────────────
            set_step('Database backup', 3)
            log('═══ STEP 3/8: Database backup ═══')
            ts = datetime.now().strftime('%Y%m%d-%H%M%S')
            run_cmd(f'mkdir -p {backup_dir}', critical=False)
            dump_file = f'{backup_dir}/nc-db-{ts}.sql.gz'
            run_cmd(
                f'cd {compose_dir} && docker compose exec -T {db_service} '
                f'mariadb-dump -uroot -p{db_root_pass} --all-databases '
                f'| gzip > {dump_file}',
                timeout=300,
            )
            out, _ = run_cmd(f'du -sh {dump_file}', critical=False)
            log(f'✓ DB backup: {out.strip() or dump_file}')

            # ── STEP 4: Data volume backup (opzionale, non blocca) ───────────
            set_step('Volume backup', 4)
            log('═══ STEP 4/8: Volume snapshot ═══')
            vol_file = f'{backup_dir}/nc-data-{ts}.tar.gz'
            run_cmd(
                f'docker run --rm '
                f'--volumes-from $(cd {compose_dir} && docker compose ps -q {app_service}) '
                f'-v {backup_dir}:/backup alpine '
                f'tar czf /backup/nc-data-{ts}.tar.gz /var/www/html/data 2>/dev/null || true',
                timeout=600,
                critical=False,
            )
            log(f'✓ Volume snapshot in {backup_dir} (o già presente)')

            # ── STEP 5: Pull immagini ─────────────────────────────────────────
            set_step('Pull images', 5)
            log('═══ STEP 5/8: docker compose pull ═══')
            run_cmd(f'cd {compose_dir} && docker compose pull', timeout=600)
            log('✓ Immagini aggiornate')

            # ── STEP 6: Ricrea container ──────────────────────────────────────
            set_step('Recreate containers', 6)
            log('═══ STEP 6/8: docker compose up -d ═══')
            run_cmd(f'cd {compose_dir} && docker compose up -d --force-recreate', timeout=300)
            log('✓ Container ricreati')

            # Attende che Nextcloud sia pronto (max 60s)
            log('Attendo che Nextcloud sia pronto…')
            run_cmd(
                f'for i in $(seq 1 12); do '
                f'  cd {compose_dir} && docker compose exec -T {app_service} '
                f'  php /var/www/html/occ status --output=json 2>/dev/null | grep -q installed && break; '
                f'  sleep 5; '
                f'done',
                timeout=90,
                critical=False,
            )

            # ── STEP 7: occ upgrade ───────────────────────────────────────────
            set_step('occ upgrade', 7)
            log('═══ STEP 7/8: occ upgrade ═══')
            run_cmd(
                f'cd {compose_dir} && docker compose exec -T {app_service} '
                f'php /var/www/html/occ upgrade --no-interaction',
                timeout=600,
            )
            log('✓ occ upgrade completato')

            # Esegui eventuali migrazioni aggiuntive (non bloccanti)
            for extra_cmd, label in [
                ('db:add-missing-indices', 'Indici DB'),
                ('db:add-missing-columns', 'Colonne DB'),
                ('db:convert-filecache-bigint', 'Bigint filecache'),
            ]:
                run_cmd(
                    f'cd {compose_dir} && docker compose exec -T {app_service} '
                    f'php /var/www/html/occ {extra_cmd} --no-interaction',
                    timeout=300,
                    critical=False,
                )
                log(f'✓ {label} OK')

            # ── STEP 8: Maintenance OFF + status ─────────────────────────────
            set_step('Maintenance mode OFF', 8)
            log('═══ STEP 8/8: Maintenance mode OFF ═══')
            maintenance(on=False)
            maintenance_was_enabled = False
            log('✓ Maintenance mode disattivato')

            out, _ = run_cmd(
                f'cd {compose_dir} && docker compose exec -T {app_service} '
                f'php /var/www/html/occ status',
                critical=False,
            )
            log('═══ AGGIORNAMENTO COMPLETATO CON SUCCESSO ═══')
            _nextcloud_state['progress'] = 100

        except Exception as e:
            err = str(e)
            _nextcloud_state['error'] = err
            log(f'❌ ERRORE: {err}')

            if maintenance_was_enabled:
                log('⚠  Maintenance mode rimane ATTIVO per sicurezza. Verificare manualmente.')
            # Non tentiamo di spegnere maintenance in caso di errore grave:
            # lo stato del sistema potrebbe essere inconsistente.

        finally:
            _nextcloud_state['running']  = False
            _nextcloud_state['done']     = True
            _nextcloud_state['end_time'] = datetime.now().isoformat()

            if _nextcloud_state['start_time']:
                start    = datetime.fromisoformat(_nextcloud_state['start_time'])
                end      = datetime.fromisoformat(_nextcloud_state['end_time'])
                duration = int((end - start).total_seconds())
                log(f'Durata totale: {duration // 60}m {duration % 60}s')

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'message': 'Nextcloud update started'}), 202


# ── 3. Route status ────────────────────────────────────────────────────────────
@system_bp.route('/api/system/nextcloud_update/status')
@handle_db_error
@cache_json_response(ttl_seconds=3)   # polling rapido, TTL breve
def api_nextcloud_update_status():
    """Restituisce lo stato corrente dell'aggiornamento Nextcloud."""
    return jsonify(_nextcloud_state)