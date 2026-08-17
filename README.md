# dsh-plugins

Out-of-tree plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).
Each subdirectory is one installable plugin **bundle** (`dsh.bundle.patch` + its own `cordis.patch.yml`),
so `dsh plugin --profile <name> add <pkg>` registers it as a profile layer automatically.

## Plugins

| Plugin | npm | What it does |
|---|---|---|
| [visualize](visualize/) | [dsh-visualize](https://www.npmjs.com/package/dsh-visualize) | `visualize_html` tool + sandboxed HTML preview card in the Web chat (Codex `/vizualize` analogue) |

## Install (published npm package)

```sh
# the profile is a pnpm workspace root, so -w is required
dsh plugin --profile <name> add -w dsh-visualize
```

Then restart the profile (the shipped web surface disables HMR, so layer changes
are not picked up live):

```sh
dsh --profile cockpit --port 3081
```

## Local development (link, live rebuilds)

```sh
dsh plugin --profile <name> add -w link:/path/to/dsh-plugins/visualize
pnpm install           # from the repo root (pnpm workspace)
pnpm --filter dsh-visualize build     # after edits; refresh the browser page
```

## Adding a new plugin

1. Create `<name>/` with a `package.json` declaring
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and a
   `cordis.patch.yml` that inserts your rows (the workspace glob
   `packages: ['*']` picks the directory up automatically).
2. For a Web UI half, add `dsh.client` (platform `web`, inject list) and an
   `exports["./client"]` bundle in the
   `window.__ModuleLoader__.load({ id, factory })` format
   (see `visualize/scripts/build-client.mjs`).
3. `pnpm install`, build, test, then
   `dsh plugin --profile <name> add -w <pkg>`.

## License

MIT
