"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppRouter } from "@/hooks/useAppRouter";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSettings, updateSettings, type Settings } from "@/store/settings";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";
import { Browser } from "@capacitor/browser";

const DEFAULT_SETTINGS: Partial<Settings> = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 9999,
  reviewOrder: "mixed",
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const isNativeIOS = useIsNativeIOS();
  const [settings, setSettings] = useState<Partial<Settings>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useAppRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      try {
        const loaded = await getSettings();
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
      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", {
        error,
        message: (error as Error)?.message,
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

  const handleOpenWebsite = async () => {
    if (isNativeIOS) {
      await Browser.open({ url: "https://soma-edu.com/billing?source=ios_app" });
    } else {
      window.location.href = "https://soma-edu.com/billing?source=ios_app";
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title={t("settings.title")} />
        <div className="flex-1 overflow-y-auto p-10">
          <div className="mx-auto max-w-4xl">
            <p className="text-muted-foreground">{t("common.loading")}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title={t("settings.title")} />
      <div className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("settings.dailyLimits")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newCardsPerDay">
                  {t("settings.newCardsPerDay")}
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
                  {t("settings.maxReviewsPerDay")}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("settings.study")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reviewOrder">{t("settings.displayOrder")}</Label>
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
                  <option value="newFirst">{t("settings.newFirst")}</option>
                  <option value="oldFirst">{t("settings.reviewFirst")}</option>
                  <option value="mixed">{t("settings.mixed")}</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {isNativeIOS && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upgrade your plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage or upgrade your subscription on the web version.
                </p>
                <Button type="button" variant="outline" onClick={handleOpenWebsite}>
                  Open website
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={loggingOut}
              className="hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {loggingOut ? t("auth.loggingOut") : t("auth.logout")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("settings.saving") : t("common.save")}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
