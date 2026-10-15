import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Resolve the app root independently of the caller's working directory.
await build({ root: fileURLToPath(new URL('../', import.meta.url)) });

// The remote Android shell starts on the legacy homepage, outside React.
// Bundle its native integration with the same locked Capacitor dependencies.
await build({
  configFile: false,
  root: fileURLToPath(new URL('../', import.meta.url)),
  build: {
    outDir: 'dist', emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('../src/lib/legacy-android-back.ts', import.meta.url)),
      formats: ['es'], fileName: () => 'native-back.js',
    },
  },
});
