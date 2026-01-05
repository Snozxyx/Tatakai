package com.tatakai.app

import android.app.Application
import com.tatakai.app.utils.ProxyManager

class TatakaiApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val supabaseUrl = BuildConfig.SUPABASE_URL
        val supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY

        if (supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()) {
            ProxyManager.initialize(
                supabaseUrl = supabaseUrl,
                apiKey = supabaseAnonKey
            )
        }
    }
}
