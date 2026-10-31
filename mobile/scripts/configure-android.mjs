import { readFile, writeFile } from 'node:fs/promises';

const activity = new URL('../android/app/src/main/java/com/houseofbriar/market/MainActivity.java', import.meta.url);
const original = await readFile(activity, 'utf8');
const generated = /^\s*package com\.houseofbriar\.market;\s*import com\.getcapacitor\.BridgeActivity;\s*public class MainActivity extends BridgeActivity \{\s*\}\s*$/;
if (!original.includes('EdgeToEdge.enable(this);')) {
  if (!generated.test(original)) throw new Error('Unexpected MainActivity; refusing to overwrite custom native code.');
  await writeFile(activity, `package com.houseofbriar.market;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
    }
}
`);
}
console.log('Configured explicit Android edge-to-edge support.');

// Use Android's supported WebAuthn integration; do not bridge private keys into JS.
let configured = await readFile(activity, 'utf8');
if (!configured.includes('setWebAuthenticationSupport')) {
  configured = configured.replace('import androidx.activity.EdgeToEdge;', `import androidx.activity.EdgeToEdge;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;`);
  configured = configured.replace('EdgeToEdge.enable(this);', `EdgeToEdge.enable(this);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                getBridge().getWebView().getSettings(),
                WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }`);
  await writeFile(activity, configured);
}
const gradle = new URL('../android/app/build.gradle', import.meta.url);
let build = await readFile(gradle, 'utf8');
if (!build.includes("apply from: 'passkeys.gradle'")) {
  build += "\napply from: 'passkeys.gradle'\n";
  await writeFile(gradle, build);
}
await writeFile(new URL('../android/app/passkeys.gradle', import.meta.url), `dependencies {
    implementation 'androidx.webkit:webkit:1.14.0'
    implementation 'androidx.credentials:credentials:1.6.0'
    implementation 'androidx.credentials:credentials-play-services-auth:1.6.0'
}
`);
const manifest = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
let xml = await readFile(manifest, 'utf8');
if (!xml.includes('android:name="asset_statements"')) {
  if (!/<application\b[^>]*>/.test(xml)) throw new Error('Android application element missing');
  xml = xml.replace(/<application\b[^>]*>/, '$&\n        <meta-data android:name="asset_statements" android:resource="@string/asset_statements" />');
  await writeFile(manifest, xml);
}
await writeFile(new URL('../android/app/src/main/res/values/passkeys.xml', import.meta.url), `<resources>
    <string name="asset_statements" translatable="false">[{\\"include\\":\\"https://houseofbriar.shop/.well-known/assetlinks.json\\"}]</string>
</resources>
`);
console.log('Configured Android WebAuthn support. Play app-signing certificate association and device testing are still required.');
