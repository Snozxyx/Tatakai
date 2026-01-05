package com.tatakai.app.ui.screens.search

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onAnimeClick: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row {
            Button(onClick = onBack) { Text("Back") }
        }
        Text(text = "Search", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = "Search input + genres chips + paginated results should be implemented here.",
            style = MaterialTheme.typography.bodyMedium
        )

        Button(onClick = { onAnimeClick("naruto-shippuden") }) { Text("Open sample anime") }
    }
}
