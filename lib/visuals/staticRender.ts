/**
 * lib/visuals/staticRender.ts
 *
 * Minimal React-element -> HTML string serializer for HOOK-FREE trees.
 * Next 15 forbids importing react-dom/server from anything in an app-router
 * route's graph, and VisualBoard is deliberately hook-free (it is pure
 * SVG/CSS), so it can be flattened by calling function components directly.
 * Not a general renderer: throws on class components, hooks and context.
 */
import React from "react";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const VOID = new Set(["area", "br", "col", "hr", "img", "input", "link", "meta", "path_"]);
const UNITLESS = new Set(["opacity", "flex", "flexGrow", "flexShrink", "fontWeight", "lineHeight", "zIndex", "order", "gridColumn", "gridRow", "zoom"]);
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const ATTR: Record<string, string> = { className: "class", htmlFor: "for", viewBox: "viewBox", preserveAspectRatio: "preserveAspectRatio", tabIndex: "tabindex" };
// SVG presentation attributes that are hyphenated in markup.
const SVG_KEBAB = new Set(["strokeWidth", "strokeDasharray", "strokeDashoffset", "strokeLinecap", "strokeLinejoin", "strokeOpacity", "fillOpacity", "fillRule", "clipRule", "textAnchor", "dominantBaseline", "fontSize", "fontFamily", "fontWeight", "letterSpacing", "stopColor", "stopOpacity", "shapeRendering", "textDecoration", "vectorEffect", "pointerEvents"]);

function styleStr(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
    .map(([k, v]) => `${k.startsWith("--") ? k : kebab(k)}:${typeof v === "number" && v !== 0 && !UNITLESS.has(k) && !k.startsWith("--") ? `${v}px` : String(v)}`)
    .join(";");
}

function attrs(props: Record<string, unknown>): string {
  let out = "";
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "key" || k === "ref" || k === "dangerouslySetInnerHTML" || k.startsWith("on")) continue;
    if (v === undefined || v === null || v === false) continue;
    const name = ATTR[k] ?? (SVG_KEBAB.has(k) ? kebab(k) : k);
    if (k === "style" && typeof v === "object") { const s = styleStr(v as Record<string, unknown>); if (s) out += ` style="${esc(s)}"`; continue; }
    out += v === true ? ` ${name}` : ` ${name}="${esc(String(v))}"`;
  }
  return out;
}

export function renderStatic(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return esc(node);
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderStatic).join("");
  const el = node as React.ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  const props = (el.props ?? {}) as Record<string, unknown>;
  if (type === React.Fragment) return renderStatic(props.children as React.ReactNode);
  if (typeof type === "function") {
    if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) throw new Error("staticRender: class components are not supported");
    return renderStatic((type as (p: unknown) => React.ReactNode)(props));
  }
  if (typeof type !== "string") throw new Error("staticRender: unsupported element type");
  const inner = props.dangerouslySetInnerHTML ? String((props.dangerouslySetInnerHTML as { __html?: string }).__html ?? "") : renderStatic(props.children as React.ReactNode);
  const a = attrs(props);
  return VOID.has(type) ? `<${type}${a}/>` : `<${type}${a}>${inner}</${type}>`;
}
