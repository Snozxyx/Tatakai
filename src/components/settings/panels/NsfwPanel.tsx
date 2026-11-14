import { AlertTriangle, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { SettingRow, SettingsSection } from "../SettingsPrimitives";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import {
  ADULT_CATEGORIES,
  normalizeAdultCategories,
} from "@/lib/adultContentPolicy";
const categoryLabels = {
  explicit: [
    "Hentai / explicit",
    "Hentai, erotica, and explicitly adult titles.",
  ],
  ecchi: ["Ecchi / suggestive", "Ecchi, nudity, and suggestive stories."],
  mature: [
    "Mature 17+",
    "Titles rated mature, including violence and dark themes.",
  ],
};
export function NsfwPanel() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useContentSafetySettings();
  const categories = normalizeAdultCategories(settings.adultCategories);
  return (
    <div className="space-y-6">
      <SettingsSection
        id="mature-content-controls"
        icon={AlertTriangle}
        title={t("adult.settingsTitle", { defaultValue: "NSFW Mode" })}
        description={t("adult.sessionDescription", {
          defaultValue:
            "Switch to separate adult catalogs for this session. Tatakai starts in SFW after reopening or reloading.",
        })}
      >
        <SettingRow
          title={t("adult.enable", { defaultValue: "Adult Mode" })}
          description={t("adult.enableDescription", {
            defaultValue:
              "Replace anime, manga, novels, search, and trending with adult content.",
          })}
          control={
            <Switch
              aria-label="Adult Mode"
              checked={settings.showAdultEverywhere}
              onCheckedChange={(checked) =>
                updateSettings({ showAdultEverywhere: checked })
              }
            />
          }
        />
      </SettingsSection>
      <SettingsSection
        title={t("adult.categories", { defaultValue: "Content filters" })}
        description={t("adult.filterDescription", {
          defaultValue:
            "Choose which categories appear in Adult Mode. Hidden categories stay out of SFW browsing.",
        })}
      >
        {ADULT_CATEGORIES.map((category) => (
          <SettingRow
            key={category}
            title={t("adult.category." + category, {
              defaultValue: categoryLabels[category][0],
            })}
            description={categoryLabels[category][1]}
            control={
              <Switch
                aria-label={categoryLabels[category][0]}
                checked={categories[category]}
                onCheckedChange={(checked) =>
                  updateSettings({
                    adultCategories: { ...categories, [category]: checked },
                  })
                }
              />
            }
          />
        ))}
        {!Object.values(categories).some(Boolean) && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            All categories are hidden. Enable a category to see adult catalogs.
          </p>
        )}
      </SettingsSection>
      <SettingsSection
        title={t("adult.presentation", {
          defaultValue: "Warnings and previews",
        })}
        icon={EyeOff}
      >
        <SettingRow
          title={t("privacy.blurSearch")}
          description="Blur adult search posters until you choose to open a title."
          control={
            <Switch
              checked={settings.blurAdultInSearch}
              onCheckedChange={(blurAdultInSearch) =>
                updateSettings({ blurAdultInSearch })
              }
            />
          }
        />
        <SettingRow
          title={t("privacy.warnBefore")}
          description="Show a warning before opening an individual adult title. Enabling Adult Mode always requires confirmation."
          control={
            <Switch
              checked={settings.warnBeforeAdultOpen}
              onCheckedChange={(warnBeforeAdultOpen) =>
                updateSettings({ warnBeforeAdultOpen })
              }
            />
          }
        />
        <SettingRow
          title="Chapter spoiler warning"
          description="Hide scene details until you choose to reveal them. Turn this off to show chapter tags immediately."
          control={<Switch aria-label="Chapter spoiler warning" checked={settings.hideAdultChapterSpoilers !== false} onCheckedChange={hideAdultChapterSpoilers => updateSettings({ hideAdultChapterSpoilers })} />}
        />
      </SettingsSection>
    </div>
  );
}
