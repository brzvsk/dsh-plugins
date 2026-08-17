/**
 * Wrap the tsdown CJS output of the browser half into the dsh client-bundle
 * format: `window.__ModuleLoader__.load({ id, factory })`. Materialization
 * calls `factory(require)` and uses its RETURN value as the module exports, so
 * the body runs inside the factory with local `module`/`exports` and returns
 * `module.exports` — the exact shape shipped client bundles use.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const body = readFileSync(join(root, 'lib', 'client.cjs'), 'utf8')

const bundle = [
  'window.__ModuleLoader__.load({',
  '\tid: "dsh-visualize",',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  body,
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')

writeFileSync(join(root, 'lib', 'client.js'), bundle)
console.log('lib/client.js written (__ModuleLoader__ bundle)')
