# DSH Message Edit

A minimal local plugin for DeepSeek Harness: edit only the latest user message and send it again. Its old reply is removed from the active conversation; earlier turns are kept. The original session is archived through DSH's existing branch mechanism.

- One pencil button beside Copy, using the native button styling.
- Edit directly inside the message bubble: Enter sends, Shift+Enter inserts a newline, Escape cancels. Cancel and Send buttons remain available.
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

`link-types` links host types to the globally installed DSH, avoiding duplicate Cordis service identities. Set `DSH_PACKAGE_ROOT` if DSH is installed elsewhere. Tested against DSH 0.1.5-rc.2. The editor reads cold sessions through the public observation API; it does not patch DSH or depend on a patched `readSession`.

The backend supports only editing the latest user text, preserving attachments and earlier turns. It uses a native fork and archives the previous session because DSH logs are append-only. It maintains no version tree, undo/redo state, or separate metadata store. Older archived sessions remain readable; existing metadata files are left untouched.

For a persistence regression check against an independently installed, unmodified host:

```sh
DSH_TEST_PACKAGE_JSON=/path/to/clean-install/package.json node --experimental-strip-types test/persistence.test.mjs
```

The test uses a temporary session store and a fresh service context to check cold restoration. It never reads personal sessions.

## Credits

Derived from [mbj733/dsh-edit-resend](https://github.com/mbj733/dsh-edit-resend), commit `9f9d2976b667c846615602111dcadf20568c3189`, itself based on [Moeblack/dsh-message-edit](https://github.com/Moeblack/dsh-message-edit). Original MIT copyright and permission notice are retained in LICENSE. The DSH client build preset is derived from DeepSeek Harness (MIT, © DeepSeek).

Local adaptation: minimal last-message editing, interface-language translations, and native button styling.
