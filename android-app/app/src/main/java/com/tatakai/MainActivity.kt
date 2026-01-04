package com.tatakai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.accompanist.systemuicontroller.rememberSystemUiController
import com.tatakai.ui.navigation.TatakaiApp
import com.tatakai.ui.theme.TatakaiTheme
import com.tatakai.ui.theme.ThemeType
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

val android.content.Context.dataStore by preferencesDataStore(name = "settings")

class MainActivity : ComponentActivity() {
    
    private val THEME_KEY = stringPreferencesKey("theme")
    
    override fun onCreate(savedInstanceState: Bundle?) {
        // Install splash screen
        installSplashScreen()
        
        super.onCreate(savedInstanceState)
        
        enableEdgeToEdge()
        
        setContent {
            val scope = rememberCoroutineScope()
            
            // Load theme preference
            val themeFlow = dataStore.data.map { preferences ->
                val themeName = preferences[THEME_KEY] ?: "midnight"
                ThemeType.fromString(themeName)
            }
            
            val currentTheme by themeFlow.collectAsState(initial = ThemeType.MIDNIGHT)
            
            TatakaiTheme(themeType = currentTheme) {
                // Set system bars color
                val systemUiController = rememberSystemUiController()
                val backgroundColor = MaterialTheme.colorScheme.background
                
                SideEffect {
                    systemUiController.setSystemBarsColor(
                        color = backgroundColor,
                        darkIcons = false
                    )
                }
                
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    TatakaiApp()
                }
            }
        }
    }
    
    // Save theme preference
    suspend fun saveTheme(theme: ThemeType) {
        dataStore.edit { preferences ->
            preferences[THEME_KEY] = theme.name.lowercase()
        }
    }
}
