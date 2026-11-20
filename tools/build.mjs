import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const sources = new URL('web/js/', root);

async function sourceVersion() {
  const entries = await readdir(sources, { withFileTypes: true, recursive: true });
  const base = fileURLToPath(sources);
  const paths = entries.filter(entry => entry.isFile()).map(entry =>
    relative(base, join(entry.parentPath, entry.name)).split(sep).join('/')
  ).sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    digest.update(path);
    digest.update(createHash('sha256').update(await readFile(new URL(path, sources))).digest());
  }
  return 'v' + digest.digest('hex').slice(0, 16);
}

const version = await sourceVersion();
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['web/js/main.js'],
  outfile: 'workstation/bundle/studio.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});
if (await sourceVersion() !== version) throw new Error('The source changed during the build.');
await writeFile(new URL('workstation/bundle/source.txt', root), version + '\n');
