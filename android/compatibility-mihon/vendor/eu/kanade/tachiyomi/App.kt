package eu.kanade.tachiyomi

import android.app.Application
import android.content.Context
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.InjektScope
import uy.kohesive.injekt.registry.default.DefaultRegistrar

open class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Injekt = InjektScope(DefaultRegistrar())
        Injekt.importModule(AppModule(this))
    }

    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(base)
    }
}
