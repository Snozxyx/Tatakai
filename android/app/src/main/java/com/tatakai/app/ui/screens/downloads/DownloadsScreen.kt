package com.tatakai.app.ui.screens.downloads

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
fun DownloadsScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = onBack) { Text("Back") }
        Text(text = "Downloads", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = "This screen should show active downloads, library, and download history with pause/resume/cancel.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
