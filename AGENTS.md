# Maintaining this catalog

This is a public collection of small DSH plugins made for personal use and shared with others. Keep it easy to browse, install, and understand. Prefer removing unnecessary UI and dependencies over adding infrastructure.

## Scope and ownership

- Each plugin owns its directory, manifest, source, installable artifacts, documentation, and tests.
- Read the target plugin's README and package.json before editing. Do not apply one plugin's DSH API assumptions to another.
- Preserve unrelated local changes. Do not delete unfinished plugins merely because they are unpublished; mark their status accurately.
- Keep root documentation concise. Put compatibility details, usage, build commands, and credits in the plugin README.
- Public-facing documentation is English. Match UI copy to the host locale where supported, with an English fallback.

## Implementation

- Reuse DSH services, UI styles, and extension points. Do not add duplicate controls for native behavior.
- Keep host and browser dependencies aligned with the target DSH release. Avoid multiple Cordis/service identities.
- Do not silently patch a user's DSH installation from plugin code. Document any required host fix and its tested version.
- Never commit credentials, personal profiles, session histories, absolute user-specific paths, logs, or local runtime backups.
- Preserve upstream MIT notices and name the original project and revision when adapting code.

## Build and verification

- Follow the plugin's documented package manager. Visualize uses the root pnpm lockfile; Message Edit currently uses a package-local npm lockfile.
- Keep installable bundles tracked: direct checkout installs rely on them. Rebuild them when their source changes.
- Do not track node_modules, caches, temporary archives, or intermediate compiler outputs.
- Run relevant existing tests and build/type checks for code changes. Documentation-only work needs link, command, manifest, and diff checks, not a full runtime rollout.
- Verify user-facing behavior in a disposable DSH conversation when changing the UI. Check reopen/restart behavior when changing session handling.
- State exactly what was tested. Experimental or older-API plugins must not be presented as verified on current DSH.

## Sharing

- Keep package names, descriptions, exports, files lists, README instructions, and runtime behavior consistent.
- Commit only the intended scope. Do not publish to npm, bump release versions, or push to GitHub unless the user requests or has authorized it.
- Never rename an installed package or move its directory without checking local links and updating the authorized installation.
