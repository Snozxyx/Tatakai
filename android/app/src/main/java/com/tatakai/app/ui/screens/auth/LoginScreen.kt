package com.tatakai.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import com.tatakai.app.ui.theme.LocalTatakaiTheme

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onContinueAsGuest: () -> Unit
) {
    val theme = LocalTatakaiTheme.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(listOf(theme.gradientStart, theme.gradientEnd))
            )
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Tatakai",
            style = MaterialTheme.typography.headlineLarge,
            color = theme.onSurface
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Sign in to sync watch history, downloads and preferences.",
            style = MaterialTheme.typography.bodyMedium,
            color = theme.onSurface.copy(alpha = 0.9f)
        )
        Spacer(modifier = Modifier.height(28.dp))
        Button(onClick = onLoginSuccess) {
            Text("Sign in / Register")
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(onClick = onContinueAsGuest) {
            Text("Continue as Guest")
        }
    }
}
