package app.tatakai.me.compatibility

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ContextThemeWrapper
import androidx.preference.*
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.ConfigurableSource
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

/** Runs the original extension preference callbacks on Android's UI thread. */
internal class MihonPreferences(private val context: Context) {
    private fun <T> main(work: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return work()
        val task = FutureTask(work)
        Handler(Looper.getMainLooper()).post(task)
        return try { task.get(20, TimeUnit.SECONDS) } finally { if (!task.isDone) task.cancel(false) }
    }
    private fun controls(source: CatalogueSource): List<Preference> {
        if (source !is ConfigurableSource) return emptyList()
        val themed = ContextThemeWrapper(context, androidx.appcompat.R.style.Theme_AppCompat)
        val manager = PreferenceManager(themed).apply { sharedPreferencesName = "source_${source.id}" }
        val screen = manager.createPreferenceScreen(themed)
        source.setupPreferenceScreen(screen)
        val result = mutableListOf<Preference>()
        fun flatten(group: PreferenceGroup) {
            for (i in 0 until group.preferenceCount) {
                val p = group.getPreference(i)
                if (p is PreferenceGroup) flatten(p) else result.add(p)
                require(result.size <= 500) { "Too many source preferences" }
            }
        }
        flatten(screen)
        return result
    }
    private fun describe(rows: List<Preference>): JSONArray = JSONArray(rows.mapIndexed { index, p ->
        val options = when (p) {
            is ListPreference -> p.entryValues.mapIndexed { i, value -> JSONObject().put("value", value.toString()).put("label", p.entries.getOrNull(i)?.toString() ?: value.toString()) }
            is MultiSelectListPreference -> p.entryValues.mapIndexed { i, value -> JSONObject().put("value", value.toString()).put("label", p.entries.getOrNull(i)?.toString() ?: value.toString()) }
            else -> emptyList()
        }
        val kind = when (p) { is TwoStatePreference -> "boolean"; is EditTextPreference -> "text"; is ListPreference -> "select"; is MultiSelectListPreference -> "multiselect"; else -> "unsupported" }
        val value: Any = when (p) { is TwoStatePreference -> p.isChecked; is EditTextPreference -> p.text ?: ""; is ListPreference -> p.value ?: ""; is MultiSelectListPreference -> JSONArray(p.values.toList()); else -> JSONObject.NULL }
        JSONObject().put("position", index).put("key", p.key).put("title", p.title?.toString() ?: p.key ?: "Source setting")
            .put("summary", runCatching { p.summary?.toString() }.getOrNull()).put("enabled", p.isEnabled).put("visible", p.isVisible)
            .put("kind", kind).put("value", value).put("options", JSONArray(options))
            .put("secret", Regex("password|token|secret|api.?key", RegexOption.IGNORE_CASE).containsMatchIn("${p.key} ${p.title}"))
    })
    fun read(source: CatalogueSource): JSONArray = main { describe(controls(source)) }
    fun change(source: CatalogueSource, position: Int, value: Any): JSONArray = main {
        val rows = controls(source)
        require(position in rows.indices) { "Invalid preference position" }
        val p = rows[position]
        require(p.isEnabled && p.isVisible) { "Source setting is unavailable" }
        val checked: Any = when (p) {
            is TwoStatePreference -> { require(value is Boolean); value }
            is EditTextPreference -> { require(value is String && value.length <= 10000); value }
            is ListPreference -> { require(value is String && p.entryValues.any { it.toString() == value }); value }
            is MultiSelectListPreference -> {
                require(value is JSONArray && value.length() <= p.entryValues.size)
                (0 until value.length()).map { value.getString(it) }.toSet().also { selected -> require(selected.all { entry -> p.entryValues.any { it.toString() == entry } }) }
            }
            else -> error("This control requires an additional host adapter")
        }
        require(p.callChangeListener(checked)) { "The source rejected this setting" }
        when (p) {
            is TwoStatePreference -> p.isChecked = checked as Boolean
            is EditTextPreference -> p.text = checked as String
            is ListPreference -> p.value = checked as String
            is MultiSelectListPreference -> @Suppress("UNCHECKED_CAST") run { p.values = checked as Set<String> }
        }
        describe(controls(source))
    }
}
