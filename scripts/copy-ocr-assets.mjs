// Copies the screenshot-reading (OCR) engine into public/ocr so the browser loads it from our own domain
// (the Content-Security-Policy does not allow third-party script hosts). Runs before dev and build.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const out = path.resolve("public/ocr");
try {
  const tess = path.dirname(require.resolve("tesseract.js/package.json"));
  const core = path.dirname(require.resolve("tesseract.js-core/package.json"));
  const lang = path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");
  mkdirSync(path.join(out, "lang"), { recursive: true });
  cpSync(path.join(tess, "dist/worker.min.js"), path.join(out, "worker.min.js"));
  for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
    cpSync(path.join(core, f), path.join(out, f));
  }
  cpSync(path.join(lang, "eng.traineddata.gz"), path.join(out, "lang/eng.traineddata.gz"));
  console.log("[ocr] assets copied to public/ocr");
} catch (err) {
  // Never block a build: the screenshot option simply reports that it is unavailable.
  console.warn("[ocr] could not copy assets:", err instanceof Error ? err.message : err);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
}
