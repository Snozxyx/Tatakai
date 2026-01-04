package com.tatakai.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tatakai.ui.screens.*
import com.tatakai.utils.haptic.rememberHapticFeedback

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object Home : Screen("home", "Home", Icons.Default.Home)
    object Search : Screen("search", "Search", Icons.Default.Search)
    object Watchlist : Screen("watchlist", "Watchlist", Icons.Default.Star)
    object Profile : Screen("profile", "Profile", Icons.Default.Person)
    
    // Detail screens
    object AnimeDetail : Screen("anime/{animeId}", "Anime Details", Icons.Default.Home)
    object VideoPlayer : Screen("player/{animeId}/{episodeId}", "Player", Icons.Default.Home)
    object Downloads : Screen("downloads", "Downloads", Icons.Default.Home)
    object Settings : Screen("settings", "Settings", Icons.Default.Home)
    object Login : Screen("login", "Login", Icons.Default.Home)
}

val bottomNavItems = listOf(
    Screen.Home,
    Screen.Search,
    Screen.Watchlist,
    Screen.Profile
)

@Composable
fun TatakaiApp() {
    val navController = rememberNavController()
    val haptic = rememberHapticFeedback()
    
    Scaffold(
        bottomBar = {
            BottomNavigationBar(navController = navController, haptic = haptic)
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(paddingValues)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(navController = navController)
            }
            composable(Screen.Search.route) {
                SearchScreen(navController = navController)
            }
            composable(Screen.Watchlist.route) {
                WatchlistScreen(navController = navController)
            }
            composable(Screen.Profile.route) {
                ProfileScreen(navController = navController)
            }
            composable(Screen.Login.route) {
                LoginScreen(navController = navController)
            }
            composable("anime/{animeId}") { backStackEntry ->
                val animeId = backStackEntry.arguments?.getString("animeId") ?: ""
                AnimeDetailScreen(navController = navController, animeId = animeId)
            }
            composable("player/{animeId}/{episodeId}") { backStackEntry ->
                val animeId = backStackEntry.arguments?.getString("animeId") ?: ""
                val episodeId = backStackEntry.arguments?.getString("episodeId") ?: ""
                VideoPlayerScreen(
                    navController = navController,
                    animeId = animeId,
                    episodeId = episodeId
                )
            }
            composable(Screen.Downloads.route) {
                DownloadsScreen(navController = navController)
            }
            composable(Screen.Settings.route) {
                SettingsScreen(navController = navController)
            }
        }
    }
}

@Composable
fun BottomNavigationBar(
    navController: NavHostController,
    haptic: com.tatakai.utils.haptic.HapticFeedback
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination
        
        bottomNavItems.forEach { screen ->
            NavigationBarItem(
                icon = { Icon(screen.icon, contentDescription = screen.title) },
                label = { Text(screen.title) },
                selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                onClick = {
                    haptic.light()
                    navController.navigate(screen.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    }
}
