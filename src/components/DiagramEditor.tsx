"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, X } from "lucide-react";
import { useTranslation } from "@/i18n";

const IMAGE_BUCKET = "card-media";
const MAX_MARKERS = 12;

export interface DiagramMarker {
  id: number;
  x: number; // relative 0–1
  y: number; // relative 0–1
  answer: string;
}

export interface DiagramData {
  image_url: string;
  markers: DiagramMarker[];
}

interface DiagramEditorProps {
  value: DiagramData | null;
  onChange: (value: DiagramData | null) => void;
}

export function DiagramEditor({ value, onChange }: DiagramEditorProps) {
  const { t } = useTranslation();
  const supabase = createClient();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("You must be logged in to upload images");
        return null;
      }

      const timestamp = Date.now();
      const extension = file.name.split(".").pop() || "png";
      const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`;
      const storagePath = `${user.id}/card-images/${fileName}`;

      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (error) {
        alert(`Upload failed: ${error.message}`);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(storagePath);

      return urlData?.publicUrl ?? null;
    } catch (error) {
      alert(`Upload error: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) {
      onChange({ image_url: url, markers: [] });
    }
    e.target.value = "";
  };

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!value?.image_url) return;
      if ((value.markers?.length ?? 0) >= MAX_MARKERS) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      const existingIds = value.markers?.map((m) => m.id) ?? [];
      const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

      onChange({
        ...value,
        markers: [...(value.markers ?? []), { id: nextId, x, y, answer: "" }],
      });
    },
    [value, onChange]
  );

  const updateAnswer = (id: number, answer: string) => {
    if (!value) return;
    onChange({
      ...value,
      markers: value.markers.map((m) => (m.id === id ? { ...m, answer } : m)),
    });
  };

  const removeMarker = (id: number) => {
    if (!value) return;
    onChange({
      ...value,
      markers: value.markers.filter((m) => m.id !== id),
    });
  };

  const handleReplaceImage = () => {
    fileInputRef.current?.click();
  };

  // ── No image yet: show upload zone ────────────────────────────────────────
  if (!value?.image_url) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("diagramEditor.image")}</label>
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-muted-foreground transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("diagramEditor.uploading")}</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("diagramEditor.uploadHint")}</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  // ── Image uploaded: show editor ────────────────────────────────────────────
  const markers = value.markers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t("diagramEditor.image")}</label>
        <Button variant="outline" size="sm" onClick={handleReplaceImage} disabled={isUploading}>
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {t("diagramEditor.replaceImage")}
        </Button>
      </div>

      {/* Image with clickable markers */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          {markers.length < MAX_MARKERS
            ? t("diagramEditor.clickToAddMarker")
            : t("diagramEditor.maxMarkersReached")}
        </p>
        <div
          className="relative w-full cursor-crosshair rounded-md overflow-hidden border border-border select-none"
          onClick={handleImageClick}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.image_url}
            alt="Diagram"
            className="w-full block"
            draggable={false}
          />
          {markers.map((marker, idx) => (
            <div
              key={marker.id}
              className="absolute flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white bg-blue-500 shadow-md border-2 border-white pointer-events-none"
              style={{
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Marker list with answer inputs */}
      {markers.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("diagramEditor.markers")}</label>
          {markers.map((marker, idx) => (
            <div key={marker.id} className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full text-xs font-bold text-white bg-blue-500">
                {idx + 1}
              </span>
              <Input
                value={marker.answer}
                onChange={(e) => updateAnswer(marker.id, e.target.value)}
                placeholder={t("diagramEditor.markerAnswerPlaceholder")}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeMarker(marker.id)}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
