package com.tatakai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.tatakai.utils.haptic.rememberHapticFeedback

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnimeDetailScreen(
    navController: NavController,
    animeId: String
) {
    val haptic = rememberHapticFeedback()
    var isInWatchlist by remember { mutableStateOf(false) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Anime Details") },
                navigationIcon = {
                    IconButton(onClick = {
                        haptic.light()
                        navController.popBackStack()
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        haptic.medium()
                        // Share anime
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Cover/Banner Image
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp)
                ) {
                    AsyncImage(
                        model = null,
                        contentDescription = "Anime cover",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                    
                    // Gradient overlay
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                androidx.compose.ui.graphics.Brush.verticalGradient(
                                    colors = listOf(
                                        androidx.compose.ui.graphics.Color.Transparent,
                                        MaterialTheme.colorScheme.background
                                    )
                                )
                            )
                    )
                }
            }
            
            // Anime Info
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Text(
                        text = "Anime Title",
                        style = MaterialTheme.typography.headlineMedium
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Chip(text = "Action")
                        Chip(text = "Adventure")
                        Chip(text = "Fantasy")
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Action Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = {
                                haptic.medium()
                                // Play first episode
                                navController.navigate("player/$animeId/episode1")
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Watch Now")
                        }
                        
                        OutlinedButton(
                            onClick = {
                                haptic.medium()
                                isInWatchlist = !isInWatchlist
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                if (isInWatchlist) Icons.Default.Check else Icons.Default.Add,
                                contentDescription = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (isInWatchlist) "In List" else "Add")
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Description
                    Text(
                        text = "Description",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "This is a sample anime description that would contain information about the plot, characters, and setting of the anime series.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Metadata
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        MetadataItem(label = "Episodes", value = "24")
                        MetadataItem(label = "Status", value = "Ongoing")
                        MetadataItem(label = "Rating", value = "8.5")
                        MetadataItem(label = "Year", value = "2024")
                    }
                }
            }
            
            // Episodes Section
            item {
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "Episodes",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            items(24) { index ->
                EpisodeCard(
                    episodeNumber = index + 1,
                    episodeTitle = "Episode ${index + 1}",
                    onClick = {
                        haptic.medium()
                        navController.navigate("player/$animeId/episode${index + 1}")
                    },
                    onDownload = {
                        haptic.medium()
                        // Download episode
                    }
                )
            }
        }
    }
}

@Composable
fun Chip(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}

@Composable
fun MetadataItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpisodeCard(
    episodeNumber: Int,
    episodeTitle: String,
    onClick: () -> Unit,
    onDownload: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Episode thumbnail placeholder
            Surface(
                modifier = Modifier.size(80.dp, 45.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.small
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                }
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Episode $episodeNumber",
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = episodeTitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }
            
            IconButton(onClick = onDownload) {
                Icon(Icons.Default.Download, contentDescription = "Download")
            }
        }
    }
}
