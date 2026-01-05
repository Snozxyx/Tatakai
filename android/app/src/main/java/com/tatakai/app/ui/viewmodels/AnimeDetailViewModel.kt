package com.tatakai.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tatakai.app.BuildConfig
import com.tatakai.app.data.models.AnimeCard
import com.tatakai.app.data.models.AnimeInfoResponse
import com.tatakai.app.data.models.EpisodeData
import com.tatakai.app.data.remote.HiAnimeClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AnimeDetailUiState {
    object Loading : AnimeDetailUiState()
    data class Success(
        val animeInfo: AnimeInfoResponse,
        val episodes: List<EpisodeData>,
        val totalEpisodes: Int
    ) : AnimeDetailUiState()
    data class Error(val message: String) : AnimeDetailUiState()
}

class AnimeDetailViewModel(private val animeId: String) : ViewModel() {
    private val apiClient = HiAnimeClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseApiKey = BuildConfig.SUPABASE_ANON_KEY
    )

    private val _uiState = MutableStateFlow<AnimeDetailUiState>(AnimeDetailUiState.Loading)
    val uiState: StateFlow<AnimeDetailUiState> = _uiState.asStateFlow()

    init {
        loadAnimeDetails()
    }

    fun loadAnimeDetails() {
        viewModelScope.launch {
            _uiState.value = AnimeDetailUiState.Loading
            try {
                val animeInfo = apiClient.fetchAnimeInfo(animeId)
                val episodeData = apiClient.fetchEpisodes(animeId)
                
                _uiState.value = AnimeDetailUiState.Success(
                    animeInfo = animeInfo,
                    episodes = episodeData.episodes,
                    totalEpisodes = episodeData.totalEpisodes
                )
            } catch (e: Exception) {
                _uiState.value = AnimeDetailUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun retry() = loadAnimeDetails()
}
