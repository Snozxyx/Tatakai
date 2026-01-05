package com.tatakai.app.ui.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.tatakai.app.ui.navigation.Routes
import com.tatakai.app.ui.screens.anime.AnimeDetailScreen
import com.tatakai.app.ui.screens.auth.LoginScreen
import com.tatakai.app.ui.screens.downloads.DownloadsScreen
import com.tatakai.app.ui.screens.home.HomeScreen
import com.tatakai.app.ui.screens.player.PlayerScreen
import com.tatakai.app.ui.screens.profile.ProfileScreen
import com.tatakai.app.ui.screens.search.SearchScreen
import com.tatakai.app.ui.screens.watchlist.WatchlistScreen
import com.tatakai.app.ui.theme.TatakaiTheme

@Composable
fun TatakaiApp(navController: NavHostController) {
    TatakaiTheme(darkTheme = isSystemInDarkTheme()) {
        NavHost(
            navController = navController,
            startDestination = Routes.Login
        ) {
            composable(Routes.Login) {
                LoginScreen(
                    onLoginSuccess = { navController.navigate(Routes.Home) { popUpTo(Routes.Login) { inclusive = true } } },
                    onContinueAsGuest = { navController.navigate(Routes.Home) { popUpTo(Routes.Login) { inclusive = true } } }
                )
            }
            composable(Routes.Home) {
                HomeScreen(
                    onSearchClick = { navController.navigate(Routes.Search) },
                    onAnimeClick = { animeId -> navController.navigate(Routes.animeDetail(animeId)) },
                    onProfileClick = { navController.navigate(Routes.Profile) },
                    onWatchlistClick = { navController.navigate(Routes.Watchlist) },
                    onDownloadsClick = { navController.navigate(Routes.Downloads) }
                )
            }
            composable(Routes.Search) {
                SearchScreen(
                    onBack = { navController.popBackStack() },
                    onAnimeClick = { animeId -> navController.navigate(Routes.animeDetail(animeId)) }
                )
            }
            composable(
                route = Routes.AnimeDetail,
                arguments = listOf(navArgument("animeId") { type = NavType.StringType })
            ) { backStackEntry ->
                val animeId = backStackEntry.arguments?.getString("animeId").orEmpty()
                AnimeDetailScreen(
                    animeId = animeId,
                    onBack = { navController.popBackStack() },
                    onPlayEpisode = { episodeId, server, category ->
                        navController.navigate(Routes.player(episodeId, server, category))
                    }
                )
            }
            composable(
                route = Routes.Player,
                arguments = listOf(
                    navArgument("episodeId") { type = NavType.StringType },
                    navArgument("server") {
                        type = NavType.StringType
                        defaultValue = "hd-1"
                    },
                    navArgument("category") {
                        type = NavType.StringType
                        defaultValue = "sub"
                    }
                )
            ) { backStackEntry ->
                val episodeId = backStackEntry.arguments?.getString("episodeId").orEmpty()
                val server = backStackEntry.arguments?.getString("server") ?: "hd-1"
                val category = backStackEntry.arguments?.getString("category") ?: "sub"
                PlayerScreen(
                    episodeId = episodeId,
                    server = server,
                    category = category,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.Watchlist) {
                WatchlistScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.Downloads) {
                DownloadsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.Profile) {
                ProfileScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
