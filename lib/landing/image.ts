"use client";
import { cleanImage } from "@/lib/landing/design";

/** Shrink a picked image until it fits the page's size cap. Returns "" when it cannot (not an image, or too detailed). */
export async function pictureToDataUrl(file: File, maxSide: number): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return "";
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return "";
  for (const side of [maxSide, Math.round(maxSide * 0.7), Math.round(maxSide * 0.5)]) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.5]) {
      const url = cleanImage(c.toDataURL("image/webp", q));
      if (url) return url;
      const jpg = cleanImage(c.toDataURL("image/jpeg", q));
      if (jpg) return jpg;
    }
  }
  return "";
}
