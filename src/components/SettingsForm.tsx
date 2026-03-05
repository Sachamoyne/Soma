"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Settings } from "@/store/settings";
import type { DeckSettings } from "@/store/deck-settings";
import { useTranslation } from "@/i18n";

interface SettingsFormProps {
  settings: Settings | DeckSettings;
  globalSettings?: Settings;
  onChange: (settings: Settings | DeckSettings) => void;
  mode: "global" | "deck";
}

// Type guard to check if settings is DeckSettings
function isDeckSettings(settings: Settings | DeckSettings): settings is DeckSettings {
  return "deckId" in settings;
}

// Component to wrap a field with inheritance toggle (for deck mode)
function FieldWrapper({
  label,
  isInherited,
  onToggleInherit,
  children,
  mode,
}: {
  label: string;
  isInherited: boolean;
  onToggleInherit?: () => void;
  children: React.ReactNode;
  mode: "global" | "deck";
}) {
  const { t } = useTranslation();

  if (mode === "global") {
    return <div className="space-y-2">{children}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!isInherited}
          onChange={onToggleInherit}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">{t("settings.customize")}</span>
      </div>
      <div className={isInherited ? "opacity-50 pointer-events-none" : ""}>
        {children}
      </div>
    </div>
  );
}

export function SettingsForm({ settings, globalSettings, onChange, mode }: SettingsFormProps) {
  const { t } = useTranslation();
  const deckSettings = isDeckSettings(settings) ? settings : null;
  const effectiveSettings = deckSettings && globalSettings ? globalSettings : settings;

  // Helper to determine if a field is inherited (null in deck settings)
  // ALWAYS returns a boolean to prevent uncontrolled component errors
  const isInherited = (field: keyof Omit<DeckSettings, "id" | "deckId">): boolean => {
    if (mode !== "deck" || !deckSettings) return false;
    return deckSettings[field] === null || deckSettings[field] === undefined;
  };

  // Helper to toggle inheritance
  const toggleInherit = (field: keyof Omit<DeckSettings, "id" | "deckId">, defaultValue: any) => {
    if (mode !== "deck" || !deckSettings || !globalSettings) return;

    const currentlyInherited = isInherited(field);
    if (currentlyInherited) {
      // Enable override: set to global value
      onChange({ ...deckSettings, [field]: globalSettings[field as keyof Settings] });
    } else {
      // Disable override: set to null (inherit)
      onChange({ ...deckSettings, [field]: null });
    }
  };

  // Get the display value for a field - ALWAYS returns a defined value
  const getDisplayValue = (field: keyof Omit<DeckSettings, "id" | "deckId" | "examDate">) => {
    const defaults = {
      newCardsPerDay: 20,
      maxReviewsPerDay: 9999,
      reviewOrder: "mixed" as const,
    };

    if (mode === "global") {
      const value = (settings as Settings)[field as keyof Settings];
      return value !== undefined && value !== null ? value : defaults[field];
    }

    if (deckSettings && globalSettings) {
      const deckValue = deckSettings[field];
      const globalValue = globalSettings[field as keyof Settings];
      // Use deck value if not null, otherwise global, otherwise default
      return deckValue !== null && deckValue !== undefined
        ? deckValue
        : (globalValue !== undefined && globalValue !== null ? globalValue : defaults[field]);
    }

    const value = (settings as Settings)[field as keyof Settings];
    return value !== undefined && value !== null ? value : defaults[field];
  };

  return (
    <div className="space-y-6">
      {/* Mode indicator for deck settings */}
      {mode === "deck" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>{t("settings.deckSpecificSettings")}</strong>
          </p>
          <p className="text-xs text-blue-700 mt-1">
            {t("settings.inheritFromGlobal")}
          </p>
        </div>
      )}

      {/* Daily limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.dailyLimits")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldWrapper
            label={t("settings.newCardsPerDay")}
            isInherited={isInherited("newCardsPerDay")}
            onToggleInherit={() => toggleInherit("newCardsPerDay", 20)}
            mode={mode}
          >
            <Label htmlFor="newCardsPerDay">{t("settings.newCardsPerDay")}</Label>
            <Input
              id="newCardsPerDay"
              type="number"
              min="1"
              max="9999"
              value={String(getDisplayValue("newCardsPerDay") ?? 20)}
              onChange={(e) => {
                const newValue = parseInt(e.target.value) || 20;
                if (mode === "global") {
                  onChange({ ...settings, newCardsPerDay: newValue } as Settings);
                } else {
                  onChange({ ...settings, newCardsPerDay: newValue } as DeckSettings);
                }
              }}
            />
          </FieldWrapper>

          <FieldWrapper
            label={t("settings.maxReviewsPerDay")}
            isInherited={isInherited("maxReviewsPerDay")}
            onToggleInherit={() => toggleInherit("maxReviewsPerDay", 9999)}
            mode={mode}
          >
            <Label htmlFor="maxReviewsPerDay">{t("settings.maxReviewsPerDay")}</Label>
            <Input
              id="maxReviewsPerDay"
              type="number"
              min="1"
              max="9999"
              value={String(getDisplayValue("maxReviewsPerDay") ?? 9999)}
              onChange={(e) => {
                const newValue = parseInt(e.target.value) || 9999;
                if (mode === "global") {
                  onChange({ ...settings, maxReviewsPerDay: newValue } as Settings);
                } else {
                  onChange({ ...settings, maxReviewsPerDay: newValue } as DeckSettings);
                }
              }}
            />
          </FieldWrapper>
        </CardContent>
      </Card>

      {/* Study */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.study")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldWrapper
            label={t("settings.displayOrder")}
            isInherited={isInherited("reviewOrder")}
            onToggleInherit={() => toggleInherit("reviewOrder", "mixed")}
            mode={mode}
          >
            <Label htmlFor="reviewOrder">{t("settings.displayOrder")}</Label>
            <select
              id="reviewOrder"
              value={String(getDisplayValue("reviewOrder") ?? "mixed")}
              onChange={(e) => {
                const newValue = e.target.value as "mixed" | "oldFirst" | "newFirst";
                if (mode === "global") {
                  onChange({ ...settings, reviewOrder: newValue } as Settings);
                } else {
                  onChange({ ...settings, reviewOrder: newValue } as DeckSettings);
                }
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="newFirst">{t("settings.newFirst")}</option>
              <option value="oldFirst">{t("settings.reviewFirst")}</option>
              <option value="mixed">{t("settings.mixed")}</option>
            </select>
          </FieldWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
