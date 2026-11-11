/**
 * Client-side image compression before upload to Supabase Storage.
 *
 * Phone photos were uploaded at full resolution (1.5 MB on average, up to 5 MB),
 * which filled the free-plan storage quota and inflated egress on every review.
 * Images are downscaled to a maximum dimension and re-encoded; the original file
 * is kept whenever compression would not make it smaller or cannot run.
 */

export interface CompressOptions {
  /** Longest side in pixels after resizing. */
  maxDimension?: number;
  /** Encoder quality between 0 and 1 (JPEG / WebP). */
  quality?: number;
}

export const DEFAULT_MAX_DIMENSION = 1600;
export const DEFAULT_QUALITY = 0.8;

/** Images under this size that already fit are uploaded unchanged. */
const SMALL_FILE_BYTES = 200 * 1024;

/** Formats that must not be re-encoded: animation or vector data would be lost. */
const PASSTHROUGH_TYPES = new Set(["image/gif", "image/svg+xml"]);

/** Formats that may carry transparency, which JPEG cannot keep. */
const ALPHA_TYPES = new Set(["image/png", "image/webp"]);

export function fitWithin(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension || longest === 0) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function shouldSkipCompression(type: string): boolean {
  return !type.startsWith("image/") || PASSTHROUGH_TYPES.has(type);
}

/**
 * Output formats to try, in order. Transparent formats try WebP then PNG so the
 * alpha channel survives; everything else becomes JPEG.
 */
export function outputTypesFor(type: string): string[] {
  return ALPHA_TYPES.has(type) ? ["image/webp", "image/png"] : ["image/jpeg"];
}

export function extensionFor(type: string): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    default:
      return type.split("/")[1] || "bin";
  }
}

export function renameWithExtension(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${extensionFor(type)}`;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to an <img> element (older Safari, unusual formats).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a smaller version of `file`, or `file` itself when compression is not
 * possible or not worth it. Never throws.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  if (shouldSkipCompression(file.type) || typeof document === "undefined") return file;

  try {
    const source = await decode(file);
    const srcWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
    const srcHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
    const target = fitWithin(srcWidth, srcHeight, maxDimension);
    const needsResize = target.width !== srcWidth || target.height !== srcHeight;

    if (!needsResize && file.size <= SMALL_FILE_BYTES) {
      if ("close" in source) source.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, target.width, target.height);
    if ("close" in source) source.close();

    for (const type of outputTypesFor(file.type)) {
      const blob = await toBlob(canvas, type, quality);
      // Safari may silently fall back to PNG when it cannot encode WebP.
      if (!blob || blob.type !== type) continue;
      if (blob.size >= file.size) return file;
      return new File([blob], renameWithExtension(file.name, type), {
        type,
        lastModified: file.lastModified,
      });
    }
    return file;
  } catch (error) {
    console.warn("[IMAGE COMPRESSION] Falling back to the original file:", error);
    return file;
  }
}
