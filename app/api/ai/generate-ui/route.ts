import { NextResponse } from "next/server";
import { groqChat, hasGroqKey } from "@/app/api/ai/_utils";

/**
 * /api/ai/generate-ui
 *
 * Takes a page context (page name, data, user intent) and returns
 * a complete HTML string for a rich inline visualization — charts,
 * dashboards, comparisons, timelines — rendered directly in the UI.
 *
 * This powers BuildMind's AI UI generation feature.
 */

export async function POST(request: Request) {
  try {
    if (!hasGroqKey()) {
      return NextResponse.json({ success: false, error: "AI not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { page, context, intent, data } = body;

    const systemPrompt = `You are BuildMind's UI generation engine. You produce ONLY clean, self-contained HTML/CSS/JS snippets — no markdown, no explanation, no backticks.

RULES:
- Output raw HTML starting with a <div> element. Nothing else.
- Use inline styles only. No external CSS, no Tailwind classes.
- Background: transparent. Text: use #e2e8f0 for primary, #94a3b8 for secondary, #64748b for muted.
- Accent colors: #6366f1 (indigo), #8b5cf6 (purple), #4ade80 (green), #fbbf24 (amber), #f87171 (red).
- Border: 1px solid rgba(255,255,255,0.08). Border radius: 10px for cards, 6px for small elements.
- Font: inherit (uses the app's font). Font sizes: 13px body, 11px secondary, 10px labels (uppercase), 15-18px headings.
- No gradients on backgrounds — use flat rgba fills. Gradients only on CTA buttons.
- Make it information-dense but scannable. Use a grid layout where appropriate.
- Include subtle motion via CSS @keyframes (fade-in, slide-up) — keep under 0.4s.
- If data includes numbers, show them prominently with colored emphasis.
- If data includes a list of items, show them as clean rows with indicators.
- Always include a clear visual hierarchy: big number/headline → supporting info → detail rows.
- Max width: 100% of container. No fixed pixel widths wider than 440px.
- For charts, use CSS-only bar charts (div heights as percentages) — no canvas, no external libraries.

CONTEXT: You are generating UI for the BuildMind founder productivity app. The founder sees this inline in their dashboard. It should feel native and high-quality.`;

    const userPrompt = `Page: ${page}
Intent: ${intent}
Context: ${JSON.stringify(context ?? {})}
Data: ${JSON.stringify(data ?? {})}

Generate a rich, beautiful HTML visualization for this. Make it immediately useful and visually impressive. Include real data from the provided context/data object. Return ONLY the HTML.`;

    const html = await groqChat(systemPrompt, [
      { role: "user", content: userPrompt }
    ]);

    // Safety: strip any markdown fences if the model added them
    const clean = html
      .replace(/^```html\n?/i, "")
      .replace(/^```\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    return NextResponse.json({ success: true, html: clean });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UI generation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
