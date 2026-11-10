import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repositoryRoot, 'node_modules', 'scanic');
const publicDirectory = path.join(repositoryRoot, 'public', 'js', 'vendor', 'scanic');

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  copyFile(path.join(packageRoot, 'dist', 'scanic.js'), path.join(publicDirectory, 'scanic.js')),
  copyFile(path.join(packageRoot, 'LICENSE'), path.join(publicDirectory, 'LICENSE')),
]);
