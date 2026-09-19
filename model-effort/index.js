// dsh-model-effort — host half.
// Pure stub: this plugin is browser-only (it renders in the
// `conversation.input.model` slot via dsh.client). The cordis loader still
// imports the package entry, so we export a no-op plugin here.
export const name = "dsh-model-effort";

export function apply() {
  // no host-side services
}
