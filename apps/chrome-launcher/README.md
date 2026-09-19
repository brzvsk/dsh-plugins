# DSH Chrome launcher

A macOS Chrome app-mode window with a separately owned local DSH server.
Closing the window leaves tasks running. `stop` gracefully stops the server;
starting again reuses an existing owned server. Foreign listeners are never stopped.

## Local commands

```sh
python3 launcher.py start
python3 launcher.py status
python3 launcher.py stop
python3 launcher.py stage-update --version stable
```

The machine-local config lives in `~/Library/Application Support/DSH Chrome/config.json`.
It declares `enabled`, `port`, `cwd`, `server_command` and `chrome_command` arrays.
The server command must accept `--port` and `--no-open`. Credentials are supplied by
that command, never embedded in the launcher. Authentication URLs remain in private logs.
A separate Chrome profile lives alongside the config.

## Updates

`stage-update` downloads a clean upstream version alongside the running installation;
it does not restart or switch the active server. If upstream has no stable release,
it fails rather than silently selecting a prerelease. Exact prerelease versions can
be selected explicitly. Activation currently requires a maintenance operation:
verify the candidate, align profile host dependencies with it, back up the profile,
stop the owned server, update `server_command`, then start and verify. Do not run
`npm update -g` as an update mechanism for this app. Never replay local core patches.
Rollback restores the prior runtime/configuration; it does not rewind session history.

## Build and test

```sh
python3 -m unittest discover -s . -p 'test_*.py'
python3 build_app.py "$HOME/Applications/DSH Chrome.app"
```

Building does not launch anything. The app uses the configured home and needs Python
at the path selected during the build, Node, DSH, and Chrome installed on that machine.
The active and previous server logs are retained locally; version candidates and
configuration backups remain until the operator removes them after validation.
