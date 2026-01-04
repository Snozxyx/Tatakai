package com.tatakai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.tatakai.ui.components.AnimeCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(navController: NavController) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Watchlist", "Favorites", "History")
    val tabIcons = listOf(
        Icons.Default.Favorite,
        Icons.Default.Favorite,
        Icons.Default.History
    )
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Collection") }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Tabs
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                        icon = {
                            Icon(
                                tabIcons[index],
                                contentDescription = title
                            )
                        }
                    )
                }
            }
            
            // Content
            when (selectedTab) {
                0 -> WatchlistContent(navController)
                1 -> FavoritesContent(navController)
                2 -> HistoryContent(navController)
            }
        }
    }
}

@Composable
fun WatchlistContent(navController: NavController) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(10) { index ->
            AnimeCard(
                title = "Watchlist Anime ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ }
            )
        }
    }
}

@Composable
fun FavoritesContent(navController: NavController) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(10) { index ->
            AnimeCard(
                title = "Favorite Anime ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ }
            )
        }
    }
}

@Composable
fun HistoryContent(navController: NavController) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(15) { index ->
            AnimeCard(
                title = "History Anime ${index + 1}",
                imageUrl = null,
                onClick = { /* Navigate to anime detail */ },
                showProgress = true,
                progress = (index * 10) % 100
            )
        }
    }
}
