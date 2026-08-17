# dsh-visualize

Out-of-tree DSH (DeepSeek Harness) plugin: the `visualize_html` tool plus a
sandboxed HTML preview card in the Web chat — a Codex `/vizualize` analogue
rendered **inside** the conversation.

## What it does

- **Node half** (`src/index.ts`, mounts in the host loader tree): registers the
  `visualize_html(path)` tool and the human-facing `/visualize [path]` command.
  It resolves the path against the session workspace, reads the file through
  `ctx.fs` (the profile's sandbox policy applies), shows the model only a short
  summary, and embeds the capped HTML in the durable `presentationMeta`
  (`tool/result.meta` → `ToolResultNode.meta`). The HTML never enters model
  context; the canonical value is execution-local.
- **Browser half** (`src/client.tsx`, a `dsh.client` dual-face package):
  registers the `visualize_html` keyed view in the `tool.call.toolview` slot.
  The settled card renders `meta.html` in an iframe with
  `sandbox="allow-scripts"` (no `allow-same-origin` → opaque origin: scripts
  run but cannot reach the page, cookies, storage, or same-origin resources),
  plus **Open in browser** (existing `host.openPath`) and **Copy HTML**.

## User-facing surface

- `/visualize <path>` — slash command (discovered by the Web command menu):
  steers a user turn that calls `visualize_html`, so the preview card appears
  in the chat. Bare `/visualize` prints usage.
- The model also sees the `tool:visualize_html` prompt section and the tool
  schema itself — that guidance is what makes the command work end to end.

## Install

Published to npm: [dsh-visualize](https://www.npmjs.com/package/dsh-visualize).

```sh
# the profile is a pnpm workspace root, so -w is required
dsh plugin --profile <name> add -w dsh-visualize
```

The package is a **bundle** — it declares `dsh.bundle.patch` and ships its own
`cordis.patch.yml`, so `dsh plugin add` registers it as a profile layer
automatically (no manual patch rows). Then restart the profile (the shipped web
surface disables HMR, so profile layers are not watched live):

```sh
dsh --profile <name> --port 3081
```

Local development checkout (live link, rebuilds picked up on page refresh):

```sh
dsh plugin --profile <name> add -w link:/path/to/dsh-plugins/visualize
```

Runtime config (row `visualize`):

```yaml
config:
  maxPreviewBytes: 262144   # cap on the HTML embedded in the durable result
```

## Development

```sh
pnpm install            # from the repo root (pnpm workspace)
pnpm --filter dsh-visualize build      # tsdown → lib/index.mjs + lib/client.js
pnpm --filter dsh-visualize typecheck  # tsc --noEmit
pnpm --filter dsh-visualize test       # node --test (node half unit tests)
```

After a rebuild, refresh the browser page — the client bundle is served
no-cache; a server restart is only needed when the loader tree changes.

## Limitations

- **Sibling assets do not load** — `srcdoc` has no base URL, so relative
  CSS/images next to the file are not fetched inside the preview; self-contained
  HTML renders fully. (Deferred: a host RPC to serve sibling assets.)
- Preview truncation is a hard byte cap; the full file opens via the browser.
- The card is Web-only (keyed tool view); headless surfaces see the summary text.
