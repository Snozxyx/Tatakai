package eu.kanade.tachiyomi

import android.app.Application
import eu.kanade.tachiyomi.network.NetworkHelper
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.protobuf.ProtoBuf
import uy.kohesive.injekt.api.InjektModule
import uy.kohesive.injekt.api.InjektRegistrar
import uy.kohesive.injekt.api.addSingleton
import uy.kohesive.injekt.api.addSingletonFactory

class AppModule(
    val app: Application,
) : InjektModule {
    @OptIn(ExperimentalSerializationApi::class)
    override fun InjektRegistrar.registerInjectables() {
        addSingleton(app)

        addSingletonFactory { NetworkHelper(app) }

        // Modern original extensions resolve their wire decoder through Injekt.
        addSingleton<ProtoBuf>(ProtoBuf)

        addSingletonFactory {
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
                coerceInputValues = true
            }
        }
    }
}
