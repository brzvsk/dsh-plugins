# Play Continue

A Play button in the native Send position after the latest turn was stopped
(`aborted`), failed (`error`), interrupted by shutdown (`interrupted`), or reached
its output limit (`max-tokens`). Also recognizes a crash-orphaned open turn.

Only appears for an idle, open top-level conversation with an empty composer,
no attachments, no queued work and no pending submission. Typing restores Send;
running sessions retain the native Stop control. Completed and blocked turns are
excluded. No automatic continuation, no changes to DSH core.

Clicking starts a **new turn** in the same session with a visible, localized
continuation message. It asks the model to check uncertain action outcomes before
repeating them. This is not a resumed provider stream or a replay of the original
prompt. The native session controller restores cold sessions and their settings.
The host rechecks the latest turn and queue immediately before waking the agent;
duplicate and stale clicks are rejected. Subagents remain under native parent control.

## Stop shortcut

Press Escape twice within 400 ms to invoke the native Stop action in the visible
running top-level conversation. The first press replaces the native Stop icon with
`Esc` for 400 ms; timeout or the second press restores the icon. Single presses and held-key repeats do not stop
it. The shortcut yields to menus, dialogs, IME composition and editable fields
outside the composer. Ambiguous split views require focus in the target composer.
The draft and queued messages retain the native Stop semantics. No automatic
restart follows: use Play explicitly.

## Install

From this directory:

```sh
dsh plugin --profile <profile> add -w "link:$PWD"
```

Restart the server and reload the existing DSH page. No credentials or new
provider configuration required. Targets clean DSH 0.1.5-rc.2.

## Development

```sh
npm ci
npm test
npm run build
```

The tracked `client.js` bundle uses DSH's module loader and host React. There are
no runtime npm dependencies. The hidden `conversation.input.right` slot component
subscribes to native input/session stores. Since Send has no replacement slot,
the plugin temporarily hides only the disabled native button and inserts its
own identically styled button at that position. It restores the native button
on input, state change or teardown. No keyboard submit behavior is intercepted.

Tests cover abnormal/completed/blocked turns, cold recovery, stale/concurrent
admission, drafts/attachments, native button restoration and cross-origin denial.
Server startup is checked separately; working user conversations are not used
for test model calls.

## Credits

Original implementation, MIT, copyright 2026 Nikolai Berezovskii. Uses public
DeepSeek Harness session-controller, agent, input and slot services. No third-party
resume-plugin source or core patches are included.
