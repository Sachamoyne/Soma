"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSettings, updateSettings, type Settings } from "@/store/settings";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

// DEFAULT VALUES - ensure all inputs are controlled from first render
const DEFAULT_SETTINGS: Partial<Settings> = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 9999,
  learningMode: "normal",
  againDelayMinutes: 10,
  reviewOrder: "mixed",
};

export default function SettingsPage() {
  // Initialize with defaults to prevent uncontrolled→controlled transitions
  const [settings, setSettings] = useState<Partial<Settings>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      try {
        const loaded = await getSettings();
        // Merge loaded settings with defaults to ensure no undefined values
        setSettings({
          ...DEFAULT_SETTINGS,
          ...loaded,
        });
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings);
      console.log("✅ Settings saved successfully");
      // Show success feedback (could add toast here)
    } catch (error) {
      // DETAILED error logging to identify the real issue
      console.error("❌ Error saving settings:", {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        settingsPayload: settings,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Error logging out:", error);
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Settings" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Settings" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Limites journalières */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Limites journalières</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newCardsPerDay">
                  Nouvelles cartes par jour
                </Label>
                <Input
                  id="newCardsPerDay"
                  type="number"
                  min="1"
                  max="9999"
                  value={settings.newCardsPerDay ?? 20}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      newCardsPerDay: parseInt(e.target.value) || 20,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxReviewsPerDay">
                  Révisions max par jour
                </Label>
                <Input
                  id="maxReviewsPerDay"
                  type="number"
                  min="1"
                  max="9999"
                  value={settings.maxReviewsPerDay ?? 9999}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxReviewsPerDay: parseInt(e.target.value) || 9999,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Apprentissage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Apprentissage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Mode d&apos;apprentissage</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="learningMode"
                      value="fast"
                      checked={(settings.learningMode ?? "normal") === "fast"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          learningMode: e.target.value as "fast",
                        })
                      }
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="font-medium">Rapide</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        (10 min → 1 jour)
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="learningMode"
                      value="normal"
                      checked={(settings.learningMode ?? "normal") === "normal"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          learningMode: e.target.value as "normal",
                        })
                      }
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="font-medium">Normal</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        (10 min → 1 jour → 3 jours)
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="learningMode"
                      value="deep"
                      checked={(settings.learningMode ?? "normal") === "deep"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          learningMode: e.target.value as "deep",
                        })
                      }
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="font-medium">Approfondi</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        (10 min → 1 jour → 3 jours → 7 jours)
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Erreurs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Erreurs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={true}
                  readOnly
                  className="w-4 h-4"
                />
                <span>Revoir les cartes échouées dans la session</span>
              </label>
              <p className="text-sm text-muted-foreground ml-6">
                Les cartes marquées Again réapparaissent après{" "}
                {settings.againDelayMinutes ?? 10} minutes
              </p>
              <div className="space-y-2 ml-6">
                <Label htmlFor="againDelayMinutes">
                  Délai avant réapparition (minutes)
                </Label>
                <Input
                  id="againDelayMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.againDelayMinutes ?? 10}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      againDelayMinutes: parseInt(e.target.value) || 10,
                    })
                  }
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>

          {/* Étude */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Étude</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reviewOrder">Ordre des révisions</Label>
                <select
                  id="reviewOrder"
                  value={settings.reviewOrder ?? "mixed"}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      reviewOrder: e.target.value as
                        | "mixed"
                        | "oldFirst"
                        | "newFirst",
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="mixed">Mélangé</option>
                  <option value="oldFirst">Anciennes d&apos;abord</option>
                  <option value="newFirst">Nouvelles d&apos;abord</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={loggingOut}
              className="hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {loggingOut ? "Déconnexion..." : "Se déconnecter"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
