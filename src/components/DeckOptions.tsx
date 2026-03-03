"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "@/components/SettingsForm";
import { getDeckSettings, updateDeckSettings, resetDeckSettings, type DeckSettings } from "@/store/deck-settings";
import { getSettings, type Settings } from "@/store/settings";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";

interface DeckOptionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  onSaved?: () => void;
}

export function DeckOptions({ open, onOpenChange, deckId, deckName, onSaved }: DeckOptionsProps) {
  const { t } = useTranslation();
  const [deckSettings, setDeckSettings] = useState<DeckSettings | null>(null);
  const [globalSettings, setGlobalSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    async function loadSettings() {
      setLoading(true);
      setError(null);

      try {

        const [deck, global] = await Promise.all([
          getDeckSettings(deckId),
          getSettings(),
        ]);

        setDeckSettings(deck);
        setGlobalSettings(global);
      } catch (error) {
        console.error("[DeckOptions] Error loading settings:", error);

        // Check if it's a database table error
        const errorMessage = (error as Error).message || String(error);
        if (errorMessage.includes("deck_settings") || errorMessage.includes("relation") || errorMessage.includes("does not exist")) {
          setError(t("deckSettings.errorTableMissing"));
        } else {
          setError(t("deckSettings.errorLoading", { message: errorMessage }));
        }
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [open, deckId]);

  const handleSave = async () => {
    if (!deckSettings) return;
    setSaving(true);
    try {
      console.log("[DeckOptions] Saving deck settings:", deckSettings);
      const saved = await updateDeckSettings(deckId, deckSettings);
      console.log("[DeckOptions] Deck settings saved:", saved);
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving deck settings:", error);
      alert("Error saving settings: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(t("settings.resetConfirm"))) {
      return;
    }

    try {
      await resetDeckSettings(deckId);
      // Reload settings
      const deck = await getDeckSettings(deckId);
      setDeckSettings(deck);
    } catch (error) {
      console.error("Error resetting deck settings:", error);
      alert("Error resetting settings: " + (error as Error).message);
    }
  };

  const hasOverrides = deckSettings && (
    deckSettings.newCardsPerDay !== null ||
    deckSettings.maxReviewsPerDay !== null ||
    deckSettings.reviewOrder !== null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("deckSettings.optionsTitle", { deckName })}</DialogTitle>
          <DialogDescription>
            {t("deckSettings.optionsDesc")}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="py-8 px-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2">{t("common.error")}</h3>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              {(error.includes("deck_settings") || error.includes("relation") || error.includes("does not exist")) && (
                <div className="text-xs text-red-600 bg-red-100 p-3 rounded">
                  <p className="font-medium mb-2">📝 Pour créer la table deck_settings :</p>
                  <ol className="list-decimal ml-4 space-y-1 mb-3">
                    <li>Ouvrez le fichier <code className="bg-red-200 px-1 rounded">SUPABASE_CLOUD_SETUP.sql</code></li>
                    <li>Allez sur <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-medium">Supabase Dashboard → SQL Editor</a></li>
                    <li>Copiez-collez le SQL et cliquez &quot;Run&quot;</li>
                  </ol>
                  <p className="text-xs italic">Consultez SETUP_DECK_SETTINGS_CLOUD.md pour plus de détails</p>
                </div>
              )}
            </div>
          </div>
        ) : loading || !deckSettings || !globalSettings ? (
          <div className="py-8 text-center text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : (
          <div className="py-4">
            <SettingsForm
              settings={deckSettings}
              globalSettings={globalSettings}
              onChange={(newSettings) => setDeckSettings(newSettings as DeckSettings)}
              mode="deck"
            />
          </div>
        )}

        <DialogFooter className="flex justify-between items-center">
          <div>
            {!error && hasOverrides && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("settings.resetToGlobal")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {error ? t("common.close") : t("common.cancel")}
            </Button>
            {!error && (
              <Button onClick={handleSave} disabled={saving || loading}>
                {saving ? t("settings.saving") : t("common.save")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
