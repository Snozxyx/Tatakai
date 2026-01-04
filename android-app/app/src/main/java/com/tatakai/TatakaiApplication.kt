package com.tatakai

import android.app.Application
import com.tatakai.integrations.supabase.SupabaseClient

class TatakaiApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Supabase
        SupabaseClient.initialize(this)
    }
}
