package com.greendms.salesman.data.secure

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * ذخیرهٔ امن توکن دسترسی با EncryptedSharedPreferences.
 *
 * برای خواندن وضعیت ورود از داخل Composableها (مثل NavGraph) که نمی‌توانند
 * AuthRepository را با Hilt تزریق کنند. دقیقاً همان فایل «greendms_auth» و کلید
 * «access_token» که AuthRepository استفاده می‌کند، تا وضعیت ورود در هر دو مسیر
 * یکسان بماند.
 */
class SecurePrefs(context: Context) {

    private val appContext = context.applicationContext

    private val masterKey = MasterKey.Builder(appContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        appContext,
        "greendms_auth",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun getToken(): String? = prefs.getString("access_token", null)

    fun saveToken(token: String) {
        prefs.edit().putString("access_token", token).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
