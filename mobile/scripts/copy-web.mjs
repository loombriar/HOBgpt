import { cp, mkdir, rm, stat } from 'node:fs/promises';
const source = new URL('../../apps/default/dist/', import.meta.url);
const target = new URL('../www/', import.meta.url);
await stat(source);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log('Copied web bundle to mobile/www');
