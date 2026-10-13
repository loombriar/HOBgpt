import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
if (config.appId !== 'com.houseofbriar.market' || config.server?.url !== 'https://houseofbriar.shop' || config.server?.cleartext !== false) throw new Error('Unsafe or missing Capacitor configuration');
const android = new URL('../android/variables.gradle', import.meta.url);
if (!existsSync(android)) throw new Error('Android project missing: run npm run android:init');
const vars = readFileSync(android, 'utf8');
for (const key of ['compileSdkVersion','targetSdkVersion']) {
  if (!new RegExp(key + String.raw`\s*=\s*36\b`).test(vars)) throw new Error(key + ' must equal 36');
}
console.log('Capacitor Android SDK target/compile API 36 verified');

const activity = readFileSync(new URL('../android/app/src/main/java/com/houseofbriar/market/MainActivity.java', import.meta.url), 'utf8');
if (!activity.includes('EdgeToEdge.enable(this);')) throw new Error('Explicit Android edge-to-edge setup is missing');
if (config.plugins?.SystemBars?.insetsHandling !== 'native') throw new Error('Native system-bar inset handling is required');
console.log('Android edge-to-edge and safe system-bar insets verified');
