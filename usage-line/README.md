# Usage Line

Estimated session cost as a third pill in the native composer stats row: `≈ $0.52`.
No conversation tab, header counters or extra dashboard. Includes the active session
and its subagent descendants. Updates every five seconds. Click the native-style
cost button for a matching popover with the total and per-model USD costs. Escape
or clicking outside closes it; hover or focus gives the estimate explanation. `*` means some models have no price and are excluded;
`$—` means the current cost could not be loaded. Small nonzero amounts show `<$0.01`.

## Install

Requires clean DSH 0.1.5-rc.2. `@laoyuehanni/dsh-token-usage` **0.4.3** is a
host-only dependency. This package reuses its ledger, backfill, pricing and settings;
it does not create another accounting system or patch DSH.

From this directory, install dependencies and align the DSH peers with your host
to avoid duplicate services:

```sh
npm install --legacy-peer-deps
node link-host.mjs /path/to/node_modules/@deepseek-ai/dsh
dsh plugin --profile <profile> add -w "link:$PWD"
```

If Token Usage is already active, remove its standalone installation before
restarting: `dsh plugin --profile <profile> remove -w @laoyuehanni/dsh-token-usage`.
Its code remains a dependency inside Usage Line. Both bundles must not be active
together: they own the same `token-usage` host row and settings. Removing only the
bundle entry is insufficient: DSH re-enables direct dependencies on plugin updates.
Restart the server and reload your existing DSH page when convenient.

The default region is overseas (USD display); existing token-usage settings and
recorded history are retained. Costs are converted from the upstream feed's CNY
rates using its exchange rate. Provider invoices, especially OpenRouter routes,
can differ. No new credentials or provider calls are added by this UI.

## Development

```sh
npm install --legacy-peer-deps
npm test
npm run build
```

`client.js` is a generated, tracked DSH module-loader bundle. The build has no
transpiler dependencies. DSH provides React at runtime. Tests cover conversion,
subagent scope, late stats mounting, host re-renders, unmount races and invalid
responses. The native stats row currently has no extension slot: a hidden composer
dock component attaches one owned node to the nearest `data-composer-stats` row.
It removes that node and cancels polling on unmount. The button and popover reuse the loaded DSH StatsPills and stat-dialog CSS classes,
including native theme colors and hover states. No global CSS or core edits.

## Credits

Host accounting is provided unchanged by [LaoYueHanNi/dsh-token-usage](https://github.com/LaoYueHanNi/dsh-token-usage), npm version 0.4.3, MIT, copyright 2026 LaoYueHanNi.
The compact UI is original code, MIT, copyright 2026 Nikolai Berezovskii.
The accounting dependency remains pinned; upgrades require compatibility checks.
