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
