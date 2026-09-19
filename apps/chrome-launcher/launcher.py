#!/usr/bin/env python3
"""Chrome app viewer and explicitly owned DSH server. No implicit cutover."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error

DEFAULT_HOME = Path.home() / 'Library/Application Support/DSH Chrome'

def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default

def write(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.chmod(0o600)
    tmp.replace(path)

def identity(pid):
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'lstart=', '-o', 'command='], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None

def owned(state):
    return bool(state and identity(state['pid']) == state['identity'])

def available(port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False

def ready(url):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except urllib.error.HTTPError as error:
        return error.code == 401
    except Exception:
        return False

def start(home, config, browser=True):
    if not config.get('enabled', False):
        raise RuntimeError('Cutover gate is CLOSED. Existing DSH has not been changed.')
    state_path = home / 'server.json'
    state = read(state_path)
    port = config['port']
    url = f'http://127.0.0.1:{port}/'
    if not owned(state):
        if not available(port):
            raise RuntimeError(f'Port {port} belongs to another process. Refusing to take over or stop it.')
        log_path = home / 'server.log'
        # Only the current startup log is retained; logs can contain local auth tokens.
        if log_path.exists():
            log_path.replace(home / 'server.previous.log')
        with log_path.open('w') as log:
            log_path.chmod(0o600)
            proc = subprocess.Popen(config['server_command'] + ['--port', str(port), '--no-open'],
                                    cwd=config['cwd'], stdout=log, stderr=subprocess.STDOUT,
                                    start_new_session=True)
        state = {'pid': proc.pid, 'identity': identity(proc.pid), 'port': port}
        # A wrapper may exec node; capture the settled process identity below.
        write(state_path, state)
        deadline = time.monotonic() + config.get('startup_timeout', 60)
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                state_path.unlink(missing_ok=True)
                raise RuntimeError(f'DSH exited during startup. See {log_path}')
            if ready(url):
                state['identity'] = identity(proc.pid)
                write(state_path, state)
                break
            time.sleep(.2)
        else:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=10)
            state_path.unlink(missing_ok=True)
            raise RuntimeError('DSH startup timed out; owned process was stopped.')
    elif not ready(url):
        raise RuntimeError('Owned server exists but is not ready. Inspect server.log; no duplicate started.')
    if browser:
        # DSH prints a tokenized URL on startup. Never echo it to console or persist it in config.
        log = (home / 'server.log').read_text(errors='replace')
        matches = re.findall(r'dsh web: (http://127\.0\.0\.1:' + str(port) + r'/\?token=[^\s]+)', log)
        launch_url = matches[-1] if matches else url
        subprocess.Popen(config['chrome_command'] + [
            '--user-data-dir=' + str(home / 'chrome-profile'), '--no-first-run',
            '--no-default-browser-check', '--app=' + launch_url,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return state

def stop(home):
    path = home / 'server.json'
    state = read(path)
    if not owned(state):
        raise RuntimeError('No owned server found. No process was stopped.')
    os.killpg(state['pid'], signal.SIGTERM)
    deadline = time.monotonic() + 15
    while owned(state) and time.monotonic() < deadline:
        time.sleep(.2)
    if owned(state):
        raise RuntimeError('Server did not stop gracefully; not forcing termination.')
    path.unlink(missing_ok=True)

def stage(home, version):
    """Install immutable candidate; never update the global/active DSH."""
    if version == 'stable':
        versions = json.loads(subprocess.check_output(['npm', 'view', '@deepseek-ai/dsh', 'versions', '--json'], text=True))
        stable = [v for v in versions if re.fullmatch(r'\d+\.\d+\.\d+', v)]
        if not stable:
            raise RuntimeError('No stable npm release exists. Choose an explicit prerelease version if desired.')
        version = max(stable, key=lambda v: tuple(map(int, v.split('.'))))
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', version):
        raise RuntimeError('Use an exact version or stable, not a floating npm tag.')
    target = home / 'updates' / version
    if target.exists():
        raise RuntimeError('Candidate directory already exists; inspect it before retrying.')
    target.mkdir(parents=True)
    subprocess.run(['npm', 'install', '--prefix', str(target), '--no-audit', '--no-fund',
                    '@deepseek-ai/dsh@' + version], check=True)
    write(target / 'candidate.json', {'version': version, 'status': 'staged-not-active',
        'required': ['isolated startup and plugin check', 'clean upstream compatibility (no core patches)',
                     'profile singleton links migration', 'explicit cutover approval']})
    print(f'Staged {version} at {target}. Active runtime and profile are unchanged.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=DEFAULT_HOME)
    parser.add_argument('action', choices=['start', 'status', 'stop', 'stage-update'])
    parser.add_argument('--version', default='stable')
    args = parser.parse_args()
    home = args.home.expanduser()
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (home / 'control.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        config = read(home / 'config.json', {})
        if args.action == 'status':
            state = read(home / 'server.json')
            print(json.dumps({'gate': 'open' if config.get('enabled') else 'closed',
                              'owned_server_running': owned(state), 'port': config.get('port')}, indent=2))
        elif args.action == 'start':
            start(home, config)
        elif args.action == 'stop':
            stop(home)
        else:
            stage(home, args.version)

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
