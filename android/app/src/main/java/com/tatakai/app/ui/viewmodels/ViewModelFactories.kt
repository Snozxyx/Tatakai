package com.tatakai.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

class AnimeDetailViewModelFactory(private val animeId: String) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AnimeDetailViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return AnimeDetailViewModel(animeId) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
