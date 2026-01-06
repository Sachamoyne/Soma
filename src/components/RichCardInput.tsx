"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

interface RichCardInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function RichCardInput({
  value,
  onChange,
  placeholder = "Enter text or drag an image...",
  label,
}: RichCardInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("[RICH CARD INPUT] ❌ No authenticated user");
        alert("You must be logged in to upload images");
        return null;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'png';
      const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`;
      const storagePath = `${user.id}/card-images/${fileName}`;

      console.log("[RICH CARD INPUT] Uploading image:", { fileName, size: file.size, bucket: 'card-media' });

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('card-media')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("[RICH CARD INPUT] ❌ Upload failed:", {
          error,
          message: error.message,
          statusCode: error.statusCode,
          bucket: 'card-media',
          path: storagePath
        });

        // Check for specific error: bucket not found
        if (error.message?.toLowerCase().includes('bucket') ||
            error.message?.toLowerCase().includes('not found') ||
            error.statusCode === '404') {
          console.error("[RICH CARD INPUT] 🚨 BUCKET 'card-media' NOT FOUND!");
          console.error("[RICH CARD INPUT] 🚨 SETUP REQUIRED:");
          console.error("[RICH CARD INPUT] 🚨   1. Go to Supabase Dashboard → Storage");
          console.error("[RICH CARD INPUT] 🚨   2. Click 'New bucket'");
          console.error("[RICH CARD INPUT] 🚨   3. Name: 'card-media'");
          console.error("[RICH CARD INPUT] 🚨   4. Public: ON");
          console.error("[RICH CARD INPUT] 🚨   5. Click 'Create bucket'");

          alert("Storage bucket 'card-media' not found.\n\nPlease create it in Supabase Dashboard:\n1. Storage → New bucket\n2. Name: 'card-media'\n3. Public: ON");
        } else {
          alert(`Upload failed: ${error.message}`);
        }

        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('card-media')
        .getPublicUrl(storagePath);

      if (!urlData?.publicUrl) {
        console.error("[RICH CARD INPUT] ❌ Failed to get public URL");
        alert("Failed to generate public URL for image");
        return null;
      }

      console.log("[RICH CARD INPUT] ✅ Image uploaded:", urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error("[RICH CARD INPUT] ❌ Upload error:", error);
      alert(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const insertImage = useCallback((url: string) => {
    const imgHtml = `<img src="${url}" style="max-width: 100%; height: auto; display: block; margin: 0.5rem 0;" />`;

    // If editor is empty or has only whitespace, replace content
    const currentHtml = editorRef.current?.innerHTML || '';
    const currentText = editorRef.current?.textContent?.trim() || '';

    if (!currentText) {
      onChange(imgHtml);
      if (editorRef.current) {
        editorRef.current.innerHTML = imgHtml;
      }
    } else {
      // Append image to existing content
      const newHtml = currentHtml + imgHtml;
      onChange(newHtml);
      if (editorRef.current) {
        editorRef.current.innerHTML = newHtml;
      }
    }
  }, [onChange]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    console.log("[RICH CARD INPUT] Files dropped:", {
      total: files.length,
      images: imageFiles.length,
    });

    for (const file of imageFiles) {
      const url = await uploadImage(file);
      if (url) {
        insertImage(url);
      }
    }
  }, [insertImage]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      console.log("[RICH CARD INPUT] Image pasted from clipboard");

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          const url = await uploadImage(file);
          if (url) {
            insertImage(url);
          }
        }
      }
    }
  }, [insertImage]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    onChange(html);
  }, [onChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}

      <div
        ref={editorRef}
        contentEditable={!isUploading}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onPaste={handlePaste}
        onInput={handleInput}
        className={`
          min-h-[100px] p-3 rounded-md border
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-input'}
          ${isUploading ? 'opacity-50 cursor-wait' : 'cursor-text'}
        `}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: value || '' }}
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      />

      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading image...
        </div>
      )}

      <style jsx global>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }

        [contenteditable] img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0.5rem 0;
          border-radius: 0.375rem;
        }
      `}</style>
    </div>
  );
}
