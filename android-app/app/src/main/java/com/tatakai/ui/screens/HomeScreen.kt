package com.tatakai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.tatakai.ui.components.AnimeCard
import com.tatakai.ui.components.SectionHeader

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(navController: NavController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tatakai") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            // Featured/Hero Section
            item {
                FeaturedSection(navController)
                Spacer(modifier = Modifier.height(24.dp))
            }
            
            // Continue Watching Section
            item {
                SectionHeader(
                    title = "Continue Watching",
                    onSeeAllClick = { /* Navigate to full list */ }
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            item {
                ContinueWatchingSection(navController)
                Spacer(modifier = Modifier.height(24.dp))
            }
            
            // Trending Section
            item {
                SectionHeader(
                    title = "Trending Now",
                    onSeeAllClick = { /* Navigate to trending */ }
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            item {
                TrendingSection(navController)
                Spacer(modifier = Modifier.height(24.dp))
            }
            
            // Recommendations Section
            item {
                SectionHeader(
                    title = "Recommended for You",
                    onSeeAllClick = { /* Navigate to recommendations */ }
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            item {
                RecommendationsSection(navController)
            }
        }
    }
}

@Composable
fun FeaturedSection(navController: NavController) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
            .padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            // Featured anime hero banner
            // Implementation with image, title, description, and watch button
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.Bottom
            ) {
                Text(
                    text = "Featured Anime",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = { /* Navigate to featured anime */ },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("Watch Now")
                }
            }
        }
    }
}

@Composable
fun ContinueWatchingSection(navController: NavController) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(5) { index ->
            AnimeCard(
                title = "Anime ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ },
                modifier = Modifier.width(140.dp)
            )
        }
    }
}

@Composable
fun TrendingSection(navController: NavController) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(10) { index ->
            AnimeCard(
                title = "Trending ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ },
                modifier = Modifier.width(140.dp)
            )
        }
    }
}

@Composable
fun RecommendationsSection(navController: NavController) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(10) { index ->
            AnimeCard(
                title = "Recommended ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ },
                modifier = Modifier.width(140.dp)
            )
        }
    }
}
