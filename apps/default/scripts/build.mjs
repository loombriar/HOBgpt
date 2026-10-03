import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Resolve the app root independently of the caller's working directory.
await build({ root: fileURLToPath(new URL('../', import.meta.url)) });
