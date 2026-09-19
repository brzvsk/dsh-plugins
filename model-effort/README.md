# Model Effort — experimental

An unpublished prototype of a combined model and reasoning-effort selector for the DSH web UI.

**Status:** not enabled in the maintained local profile and not verified against current DSH. Its manifest depends on the older `dsh-client-runtime` API. Do not install it alongside a current native selector without first checking compatibility and whether it adds anything useful.

The browser implementation is hand-authored in `lib/client.js`; despite the directory name, this is source, not a disposable generated artifact. `index.js` is the no-op host entry and `cordis.patch.yml` is the bundle registration.

There is no build pipeline or published npm release. The package is marked private. Retained for reference and possible future adaptation.

License: MIT, under the repository's root LICENSE.
