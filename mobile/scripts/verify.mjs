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
if (!activity.includes('WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)') || !activity.includes('WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP')) throw new Error('Guarded Android passkey support is missing');
const passkeysGradle=readFileSync(new URL('../android/app/passkeys.gradle',import.meta.url),'utf8');
if(!passkeysGradle.includes('androidx.webkit:webkit:1.14.0')||!passkeysGradle.includes('androidx.credentials:credentials:1.6.0'))throw new Error('Android passkey dependencies missing');
console.log('Android passkey integration configured; verify Play app-signing association and test on a physical device.');

const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const association = readFileSync(new URL('../android/app/src/main/res/values/passkeys.xml', import.meta.url), 'utf8');
const build = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
if (!manifest.includes('android:name="asset_statements"') || !association.includes('https://houseofbriar.shop/.well-known/assetlinks.json') || !build.includes("apply from: 'passkeys.gradle'")) throw new Error('Android passkey association or dependency wiring missing');
