package com.tatakai.app.data.remote

import com.google.gson.annotations.SerializedName

data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean? = null,
    @SerializedName("status") val status: Int? = null,
    @SerializedName("data") val data: T? = null,
    @SerializedName("error") val error: String? = null
)
