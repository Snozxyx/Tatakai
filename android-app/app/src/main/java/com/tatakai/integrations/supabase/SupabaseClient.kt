package com.tatakai.integrations.supabase

import android.content.Context
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import com.tatakai.BuildConfig

/**
 * Singleton Supabase client for the Tatakai app
 * Provides authentication, database, realtime, and storage capabilities
 */
object SupabaseClient {
    
    private lateinit var client: SupabaseClient
    
    fun initialize(context: Context) {
        client = createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY
        ) {
            install(Auth) {
                // Use Android shared preferences for session storage
                // Sessions will persist across app restarts
            }
            install(Postgrest)
            install(Realtime)
            install(Storage)
        }
    }
    
    fun getInstance(): SupabaseClient {
        if (!::client.isInitialized) {
            throw IllegalStateException("SupabaseClient must be initialized first")
        }
        return client
    }
    
    val auth: Auth
        get() = getInstance().auth
    
    val postgrest: Postgrest
        get() = getInstance().postgrest
}
