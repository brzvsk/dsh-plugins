# dsh-plugins

Out-of-tree plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).
Each subdirectory is one installable plugin **bundle** (`dsh.bundle.patch` + its own `cordis.patch.yml`),
so `dsh plugin --profile <name> add <pkg>` registers it as a profile layer automatically.

## Plugins

| Plugin | What it does |
|---|---|
| [visualize](visualize/) | `visualize_html` tool + sandboxed HTML preview card in the Web chat (Codex `/vizualize` analogue) |

## Install

```sh
# local checkout (this repo):
dsh plugin --profile cockpit add -w link:/path/to/dsh-plugins/visualize

# published npm package:
dsh plugin --profile cockpit add dsh-visualize

# any other profile works the same; profiles must be restarted after layer changes
```

## Adding a new plugin

1. Create `packages/<name>/` … no — create `<name>/` with a `package.json`
   declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and a
   `cordis.patch.yml` that inserts your rows (the workspace glob `packages: ['*']`
   picks it up automatically).
2. For a Web UI half, add `dsh.client` (platform `web`, inject list) and an
   `exports["./client"]` bundle in the `window.__ModuleLoader__.load({ id, factory })`
   format (see `visualize/scripts/build-client.mjs`).
3. `pnpm install`, build, test, then `dsh plugin --profile <name> add <pkg>`.

## License

MIT
