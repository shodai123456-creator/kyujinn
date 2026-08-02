import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'vendor'), { recursive: true });
await cp(join(root, 'app'), dist, { recursive: true });
await cp(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'), join(dist, 'vendor', 'pdf.mjs'));
await cp(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'), join(dist, 'vendor', 'pdf.worker.mjs'));
await cp(join(root, 'node_modules', 'mammoth', 'mammoth.browser.min.js'), join(dist, 'vendor', 'mammoth.js'));
