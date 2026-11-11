import { describe, expect, it } from "vitest";
import {
  compressImage,
  fitWithin,
  outputTypesFor,
  renameWithExtension,
  shouldSkipCompression,
} from "./image-compression";

describe("fitWithin", () => {
  it("keeps images that already fit", () => {
    expect(fitWithin(1200, 800, 1600)).toEqual({ width: 1200, height: 800 });
  });

  it("scales a landscape phone photo by its longest side", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait photo by its height", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never returns a zero dimension", () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("format choices", () => {
  it("leaves GIF, SVG and non-images untouched", () => {
    expect(shouldSkipCompression("image/gif")).toBe(true);
    expect(shouldSkipCompression("image/svg+xml")).toBe(true);
    expect(shouldSkipCompression("application/pdf")).toBe(true);
    expect(shouldSkipCompression("image/jpeg")).toBe(false);
  });

  it("keeps transparency for PNG and WebP, uses JPEG otherwise", () => {
    expect(outputTypesFor("image/png")).toEqual(["image/webp", "image/png"]);
    expect(outputTypesFor("image/webp")).toEqual(["image/webp", "image/png"]);
    expect(outputTypesFor("image/jpeg")).toEqual(["image/jpeg"]);
    expect(outputTypesFor("image/heic")).toEqual(["image/jpeg"]);
  });

  it("renames the file to match the new format", () => {
    expect(renameWithExtension("IMG_1234.HEIC", "image/jpeg")).toBe("IMG_1234.jpg");
    expect(renameWithExtension("schema.png", "image/webp")).toBe("schema.webp");
    expect(renameWithExtension("noext", "image/jpeg")).toBe("noext.jpg");
  });
});

describe("compressImage", () => {
  it("returns the original file when it cannot run (no DOM)", async () => {
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    await expect(compressImage(file)).resolves.toBe(file);
  });
});
