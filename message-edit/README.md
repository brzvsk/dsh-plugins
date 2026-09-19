# DSH Message Edit

A minimal local plugin for DeepSeek Harness: edit only the latest user message and send it again. Its old reply is removed from the active conversation; earlier turns are kept. The original session is archived through DSH's existing branch mechanism.

- One pencil button beside Copy, using the native button styling.
- No header controls, retry buttons, counters, or timeline tab.
- English, Russian, and Chinese follow the DSH interface locale (English fallback).
- Stopping an in-flight reply is handled by the inherited edit operation.
- Editing conversation history does not undo file changes or external tool effects.

## Install locally

```sh
dsh plugin --profile <profile> add -w link:/absolute/path/to/dsh-plugins/message-edit
```

Remove `dsh-edit-resend` from that profile before enabling this replacement; both own the same backend route. Restart DSH after changing plugins.

## Build

```sh
npm ci --ignore-scripts
npm run link-types
npm run build
npm test
```

`link-types` links host types to the globally installed DSH, avoiding duplicate Cordis service identities. Set `DSH_PACKAGE_ROOT` if DSH is installed elsewhere. Tested against DSH 0.1.5-rc.2. That host release required a local `dsh-session-query` restore-validation fix for persisted branches; the fix replaces `Session.create(...)` validation in `dsh-session-query.readSession` with `Session.fromRestore(...)` using cloned events/header and the original inherited count. An upstream DSH upgrade may overwrite that host fix; verify branch reopening after upgrading.

## Credits

Derived from [mbj733/dsh-edit-resend](https://github.com/mbj733/dsh-edit-resend), commit `9f9d2976b667c846615602111dcadf20568c3189`, itself based on [Moeblack/dsh-message-edit](https://github.com/Moeblack/dsh-message-edit). Original MIT copyright and permission notice are retained in LICENSE. The DSH client build preset is derived from DeepSeek Harness (MIT, © DeepSeek).

Local adaptation: minimal last-message editing, interface-language translations, and native button styling.
