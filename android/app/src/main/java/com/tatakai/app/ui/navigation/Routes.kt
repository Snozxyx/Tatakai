package com.tatakai.app.ui.navigation

object Routes {
    const val Login = "login"
    const val Home = "home"
    const val Search = "search"

    const val AnimeDetail = "anime/{animeId}"
    fun animeDetail(animeId: String) = "anime/$animeId"

    const val Player = "player/{episodeId}?server={server}&category={category}"
    fun player(episodeId: String, server: String, category: String) = "player/$episodeId?server=$server&category=$category"

    const val Watchlist = "watchlist"
    const val Downloads = "downloads"
    const val Profile = "profile"
}
