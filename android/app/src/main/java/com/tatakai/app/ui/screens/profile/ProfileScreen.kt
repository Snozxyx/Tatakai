package com.tatakai.app.ui.screens.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ProfileScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = onBack) { Text("Back") }
        Text(text = "Profile", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = "This screen should implement profile, settings, theme selector, quality/subtitles preferences and account actions.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
