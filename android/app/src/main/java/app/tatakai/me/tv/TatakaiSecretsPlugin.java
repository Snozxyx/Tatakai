package app.tatakai.me.tv;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Values never leave app-private storage unencrypted. The nonexportable key lives in Android Keystore. */
@CapacitorPlugin(name = "TatakaiSecrets")
public class TatakaiSecretsPlugin extends Plugin {
    private static final String ALIAS = "tatakai-device-secrets";
    private javax.crypto.SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (javax.crypto.SecretKey) ks.getKey(ALIAS, null);
    }
    private android.content.SharedPreferences store() { return getContext().getSharedPreferences("tatakai-secrets", 0); }
    @PluginMethod public void set(PluginCall call) {
        try {
            String name = call.getString("key"), value = call.getString("value");
            if (name == null || value == null) { call.reject("Key and value required"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!store().edit().putString(name, encoded).commit()) throw new Exception("Storage failed");
            call.resolve();
        } catch (Exception e) { call.reject("Unable to store device secret"); }
    }
    @PluginMethod public void get(PluginCall call) {
        try {
            String name = call.getString("key"); if (name == null) { call.reject("Key required"); return; }
            String value = store().getString(name, null); JSObject result = new JSObject();
            if (value != null) {
                String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                cipher.updateAAD(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
            } else result.put("value", JSONObjectNull());
            call.resolve(result);
        } catch (Exception e) { call.reject("Unable to read device secret"); }
    }
    private Object JSONObjectNull() { return org.json.JSONObject.NULL; }
    @PluginMethod public void remove(PluginCall call) {
        String name = call.getString("key"); if (name == null) { call.reject("Key required"); return; }
        store().edit().remove(name).apply(); call.resolve();
    }
}
