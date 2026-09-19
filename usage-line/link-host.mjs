// Link only this plugin's peers; never modify the host installation.
import {createRequire} from 'node:module';
import {mkdir, lstat, unlink, symlink} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
if (!process.argv[2]) throw new Error('Usage: node link-host.mjs /path/to/node_modules/@deepseek-ai/dsh');
const host = createRequire(resolve(process.argv[2], 'package.json'));
const root = fileURLToPath(new URL('./node_modules/@deepseek-ai/', import.meta.url));
await mkdir(root, {recursive:true});
for (const name of ['dsh-credentials', 'dsh-settings', 'schemastery']) {
  const target = dirname(host.resolve('@deepseek-ai/' + name + '/package.json'));
  const link = resolve(root, name);
  const existing = await lstat(link).catch(error => {if(error.code !== 'ENOENT') throw error;});
  if (existing && !existing.isSymbolicLink()) throw new Error('Refusing to replace non-symlink: ' + link);
  if (existing) await unlink(link);
  await symlink(target, link, 'dir');
}
console.log('DSH peers linked in this plugin only.');
