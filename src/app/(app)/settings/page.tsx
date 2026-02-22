"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppRouter } from "@/hooks/useAppRouter";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSettings, updateSettings, type Settings } from "@/store/settings";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Trash2, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";
import { IOSPaywall } from "@/components/IOSPaywall";

const DEFAULT_SETTINGS: Partial<Settings> = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 9999,
  reviewOrder: "mixed",
};

// ─── Delete-account confirmation modal ───────────────────────────────────────

interface DeleteModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
  error: string | null;
}

function DeleteAccountModal({ onConfirm, onCancel, deleting, error }: DeleteModalProps) {
  const { t } = useTranslation();
  // Trap focus and close on Escape
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deleting, onCancel]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-desc"
        className="w-full max-w-sm rounded-2xl bg-background border border-border p-6 shadow-xl space-y-5"
      >
        {/* Icon + title */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 id="delete-title" className="text-lg font-semibold">
            {t("settings.dangerZone.confirmTitle")}
          </h2>
          <p id="delete-desc" className="text-sm text-muted-foreground leading-relaxed">
            {t("settings.dangerZone.confirmDesc")}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            className="w-full"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("settings.dangerZone.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("settings.dangerZone.confirmButton")}
              </>
            )}
          </Button>
          <Button
            ref={cancelRef}
            variant="outline"
            className="w-full"
            disabled={deleting}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation();
  const isNativeIOS = useIsNativeIOS();
  const [settings, setSettings] = useState<Partial<Settings>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useAppRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      try {
        const loaded = await getSettings();
        setSettings({ ...DEFAULT_SETTINGS, ...loaded });
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
      console.error("Error saving settings:", error);
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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    console.log("[Settings] Requesting account deletion...");

    try {
      const response = await fetch("/api/delete-account", { method: "POST" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error (${response.status})`);
      }

      console.log("[Settings] Account deleted. Signing out...");

      // Sign out locally (session is already invalidated server-side)
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error("[Settings] Delete account error:", err);
      setDeleteError(
        err instanceof Error
          ? err.message
          : t("settings.dangerZone.errorDefault")
      );
      setDeleting(false);
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
      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        <div className="mx-auto max-w-4xl space-y-8">

          {/* Daily limits */}
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

          {/* Study order */}
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

          {/* iOS in-app subscription paywall */}
          {isNativeIOS && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("settings.subscription")}</CardTitle>
              </CardHeader>
              <CardContent>
                <IOSPaywall
                  onSuccess={(plan) => {
                    console.log("[Settings] Subscription activated:", plan);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Actions row (logout + save) */}
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

          {/* Danger zone */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("settings.dangerZone.title")}
            </p>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">{t("settings.dangerZone.deleteAccount")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.dangerZone.deleteDesc")}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteModal(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("settings.dangerZone.deleteAccount")}
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <Link href="/privacy" className="underline hover:text-foreground">
              {t("settings.privacyPolicy")}
            </Link>
          </div>

        </div>
      </div>

      {/* Confirmation modal */}
      {showDeleteModal && (
        <DeleteAccountModal
          onConfirm={handleDeleteAccount}
          onCancel={() => {
            if (!deleting) setShowDeleteModal(false);
          }}
          deleting={deleting}
          error={deleteError}
        />
      )}
    </>
  );
}
