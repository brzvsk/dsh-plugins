import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).with_name('launcher.py'))
l = importlib.util.module_from_spec(spec)
spec.loader.exec_module(l)

class LauncherTests(unittest.TestCase):
    def test_auth_challenge_means_server_is_ready(self):
        import urllib.error
        with patch.object(l.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('http://localhost', 401, 'Unauthorized', {}, None)):
            self.assertTrue(l.ready('http://localhost'))

    def test_gate_never_launches(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(l.subprocess, 'Popen') as spawn:
            with self.assertRaisesRegex(RuntimeError, 'CLOSED'):
                l.start(Path(tmp), {'enabled': False})
            spawn.assert_not_called()

    def test_foreign_port_never_taken_over(self):
        with tempfile.TemporaryDirectory() as tmp, socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); sock.listen()
            with patch.object(l.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(RuntimeError, 'another process'):
                    l.start(Path(tmp), {'enabled': True, 'port': sock.getsockname()[1]})
                spawn.assert_not_called()

    def test_stale_pid_never_stopped(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            l.write(home/'server.json', {'pid': 1, 'identity': 'wrong'})
            with patch.object(l.os, 'killpg') as kill:
                with self.assertRaisesRegex(RuntimeError, 'No owned'):
                    l.stop(home)
                kill.assert_not_called()

    def test_real_isolated_server_reused_and_stopped(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            fake = home/'server.py'
            fake.write_text('import http.server,sys\np=int(sys.argv[sys.argv.index("--port")+1])\nhttp.server.HTTPServer(("127.0.0.1",p),http.server.SimpleHTTPRequestHandler).serve_forever()\n')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
            config={'enabled':True,'port':port,'cwd':tmp,'server_command':[sys.executable,str(fake)],'startup_timeout':5}
            state=l.start(home,config,browser=False)
            try:
                self.assertTrue(l.owned(state))
                self.assertEqual(l.start(home,config,browser=False)['pid'],state['pid'])
                # Reap the actual child while stop waits, as a parent supervisor would.
                import threading,os
                thread=threading.Thread(target=lambda:os.waitpid(state['pid'],0))
                thread.start(); l.stop(home); thread.join(timeout=2)
                self.assertFalse(l.ready(f'http://127.0.0.1:{port}/'))
            finally:
                if l.owned(state): l.os.killpg(state['pid'], l.signal.SIGTERM)

    def test_stable_does_not_silently_select_prerelease(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(l.subprocess,'check_output',return_value='["0.1.5-rc.2"]'), patch.object(l.subprocess,'run') as install:
            with self.assertRaisesRegex(RuntimeError,'No stable'):
                l.stage(Path(tmp),'stable')
            install.assert_not_called()

if __name__=='__main__': unittest.main()
