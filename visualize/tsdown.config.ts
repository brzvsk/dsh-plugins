import { defineConfig } from 'tsdown'

// Bare imports stay unbundled: @deepseek-ai/* and react resolve from the host
// loader tree / the browser boot graph, exactly like shipped client bundles.
const neverBundle = [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime']

export default defineConfig([
  // Node half: plain ESM consumed by the host loader tree.
  {
    name: 'host',
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'lib',
    clean: true,
    deps: { neverBundle },
  },
  // Browser half: CJS body that scripts/build-client.mjs wraps into the
  // window.__ModuleLoader__.load({ id, factory }) client-bundle format.
  {
    name: 'client-cjs',
    entry: ['src/client.tsx'],
    format: ['cjs'],
    outDir: 'lib',
    clean: false,
    deps: { neverBundle },
  },
])
