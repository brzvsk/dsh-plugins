#!/usr/bin/env python3
"""Build a relocatable app. Building never launches DSH or Chrome."""
import argparse
from pathlib import Path
import plistlib
import shutil
import sys
p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
a = p.parse_args()
app = a.output
if app.exists():
    raise SystemExit('Output already exists; choose a new path.')
resources = app / 'Contents/Resources'
binary = app / 'Contents/MacOS'
resources.mkdir(parents=True)
binary.mkdir()
shutil.copy2(Path(__file__).with_name('launcher.py'), resources / 'launcher.py')
script = binary / 'DSH Chrome'
script.write_text('#!/bin/zsh\nexport PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"\n' +
                  'APP_ROOT="$(cd "$(dirname "$0")/../Resources" && pwd)"\n' +
                  'exec ' + "'" + sys.executable.replace("'", "'\\''") + "'" + ' "$APP_ROOT/launcher.py" start\n')
script.chmod(0o755)
with (app / 'Contents/Info.plist').open('wb') as f:
    plistlib.dump({'CFBundleName': 'DSH Chrome', 'CFBundleDisplayName': 'DSH Chrome',
                  'CFBundleIdentifier': 'local.dsh.chrome-launcher', 'CFBundleExecutable': 'DSH Chrome',
                  'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1', 'LSUIElement': True}, f)
print(app)
