import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd();
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of ['index.html', 'styles.css', 'src', 'assets', 'extension']) await cp(resolve(root, path), resolve(out, path), { recursive: true });
console.log('Built the offline POMIBERRY web app into dist/.');
