import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
const host = process.env.DSH_PACKAGE_ROOT ?? join(globalRoot, '@deepseek-ai/dsh')
const source = join(host, 'node_modules/@deepseek-ai')
if (!existsSync(source)) throw new Error('DSH host dependencies not found: ' + source)
const scope = join(root, 'node_modules/@deepseek-ai')
mkdirSync(scope, { recursive: true })
for (const name of readdirSync(source)) {
  const target = join(scope, name)
  rmSync(target, { recursive: true, force: true })
  symlinkSync(join(source, name), target, 'junction')
}
