"use client";

import { useRef, useState } from "react";
import { fingerprintBytes, metricsLine, PLATFORM_LABEL, readScreenshotText, screenshotProofText, suggestSignal, type ScreenshotReading } from "@/lib/screenshotMetrics";

export interface ScreenshotResult {
  proof: string;
  kind: "reply" | "other" | null;
  count: number;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Reads a screenshot ON THE FOUNDER'S DEVICE (free, open-source text recognition). The picture is never uploaded:
 * only the text found in it becomes proof. The founder sees what was read and decides whether to use it.
 */
export default function ScreenshotProof({ onUse }: { onUse: (r: ScreenshotResult) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<{ reading: ScreenshotReading; fingerprint: string } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setResult(null); setMsg("");
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { setState("error"); setMsg("Use a PNG, JPG or WebP screenshot."); return; }
    if (file.size > MAX_BYTES) { setState("error"); setMsg("That picture is too large. Use one under 8 MB."); return; }
    setState("reading"); setProgress(0);
    try {
      const bytes = await file.arrayBuffer();
      const fingerprint = await fingerprintBytes(bytes);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr/lang",
        workerBlobURL: false,
        gzip: true,
        logger: (m: { status?: string; progress?: number }) => { if (m.status === "recognizing text" && typeof m.progress === "number") setProgress(Math.round(m.progress * 100)); },
      });
      try {
        const { data } = await worker.recognize(new Blob([bytes], { type: file.type }));
        const reading = readScreenshotText(data.text);
        if (!reading.readable) { setState("error"); setMsg("I could not read enough text in that picture. Try a sharper, larger screenshot, or paste the link instead."); return; }
        setResult({ reading, fingerprint });
        setState("done");
      } finally {
        await worker.terminate().catch(() => undefined);
      }
    } catch {
      setState("error");
      setMsg("Reading screenshots is not available right now. Paste the link or the text instead.");
    }
  }

  const stats = result ? metricsLine(result.reading.metrics) : "";
  const suggestion = result ? suggestSignal(result.reading.metrics) : null;

  return (
    <div style={{ marginTop: 10 }}>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={state === "reading"}
        className="min-h-10 rounded-[var(--r-md)] bg-[var(--bm-bg3)] px-3.5 text-sm text-[var(--bm-text2)]">
        {state === "reading" ? `Reading your screenshot${progress ? ` ${progress}%` : "..."}` : "Add a screenshot instead"}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-[var(--bm-text3)]">The picture stays on your device. BuildMind reads the numbers and words in it and keeps only that text. A screenshot counts as proof, not as verified, because pictures can be edited.</p>
      {state === "error" && <p role="alert" className="mt-2 text-sm text-[var(--bm-text2)]">{msg}</p>}
      {state === "done" && result && (
        <div role="status" className="mt-3 grid gap-2 rounded-[var(--r-md)] bg-[var(--bm-bg3)] p-3.5 text-sm text-[var(--bm-text2)]">
          <div><strong className="text-[var(--bm-text)]">Read from your screenshot:</strong> {PLATFORM_LABEL[result.reading.platform]}{stats ? `, ${stats}` : ", no counts found"}.</div>
          {result.reading.excerpt && <div className="text-[var(--bm-text3)]">“{result.reading.excerpt}”</div>}
          {!stats && <div className="text-[var(--bm-text3)]">No numbers were found, so this only shows that the post exists. You can still use it as proof.</div>}
          <div>
            <button type="button" className="min-h-10 rounded-[var(--r-md)] bg-[var(--bm-accent)] px-3.5 text-sm font-bold text-[#151109]"
              onClick={() => onUse({ proof: screenshotProofText(result.fingerprint, result.reading), kind: suggestion?.kind ?? null, count: suggestion?.count ?? 0 })}>
              Use this as my proof
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
