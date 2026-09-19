# Small plugins for DeepSeek Harness

A personal collection of small [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins. Built for my own daily use and shared for anyone who finds them useful.

Each folder is a separate plugin. Install only the ones you want.

## Plugins

| Plugin | What it adds | Availability |
| --- | --- | --- |
| [Visualize](visualize/) | Interactive HTML previews inside the conversation, with a `/visualize` command | [npm: dsh-visualize](https://www.npmjs.com/package/dsh-visualize), v0.2.1 |
| [Message Edit](message-edit/) | One pencil button to edit the last user message and replace its reply; follows the interface language | Install from this checkout; tested on DSH 0.1.5-rc.2, with a host compatibility fix described in its README |

DSH's plugin APIs change between releases. A successful install does not establish runtime compatibility; check each plugin's README before using it.

## Install

For Visualize from npm:

```sh
dsh plugin --profile <profile> add -w dsh-visualize
```

For a plugin from this repository:

```sh
git clone https://github.com/brzvsk/dsh-plugins.git
cd dsh-plugins
dsh plugin --profile <profile> add -w "link:$PWD/message-edit"
```

Replace `<profile>` with your DSH profile. Restart DSH after adding or removing a plugin. Ready-to-load bundles are included in Git, so linking a checkout does not require a build first.

To remove a plugin:

```sh
dsh plugin --profile <profile> remove -w dsh-message-edit-local
```

## Development

Source, build instructions, limitations, and credits live in each plugin directory. Visualize uses the root pnpm workspace; Message Edit currently has its own npm lockfile and build setup. Follow the plugin's README rather than mixing package managers in the same directory.

The repository keeps runtime bundles needed for direct installation. Dependencies, logs, caches, intermediate build files, local profiles, and credentials do not belong in Git.

See [AGENTS.md](AGENTS.md) for maintenance conventions. Small fixes and focused additions are welcome; this is a collection of independent plugins, not a framework.

## License and credits

MIT. Each plugin retains its applicable license and attribution. Message Edit is adapted from mbj733/dsh-edit-resend and Moeblack/dsh-message-edit; see its [credits](message-edit/README.md#credits).
