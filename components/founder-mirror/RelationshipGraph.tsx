"use client";

/**
 * components/founder-mirror/RelationshipGraph.tsx
 *
 * Full interactive view of the graph lib/founderRelationships.ts already
 * builds (Goal → Assumption/Milestone/Decision/Metric → Task → Action →
 * Outcome → Evidence). Previously this data reached the client only as two
 * numbers ("N observed entities / N connected relationships") plus one
 * text narrative for a single milestone — this renders the actual graph:
 * pan, zoom, click a node to trace what feeds it and what it feeds,
 * filter by node type.
 *
 * No new graph library — the underlying data is a small DAG (bounded by
 * the 80-task/80-reflection query caps in the mirror API route), so a
 * deterministic layered layout (nodes grouped into columns by type, one
 * column per "depth" in the Goal→Evidence chain) is enough; no force
 * simulation needed and nothing to tune.
 */

import { useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Target, HelpCircle, Flag, ListChecks, Zap, CircleCheck, Search, GitCommit, BarChart3, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";

export type RelationshipNodeType =
  | "goal" | "milestone" | "task" | "action" | "outcome" | "evidence" | "assumption" | "decision" | "metric";

export interface RelationshipNode {
  id: string;
  type: RelationshipNodeType;
  label: string;
  status?: string | null;
  timestamp?: string | null;
}

export interface RelationshipEdge {
  from: string;
  to: string;
  relation: string;
}

export interface StartupRelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

const TYPE_META: Record<RelationshipNodeType, { color: string; icon: typeof Target; label: string; layer: number }> = {
  goal: { color: "var(--bm-accent)", icon: Target, label: "Goal", layer: 0 },
  assumption: { color: "var(--bm-amber)", icon: HelpCircle, label: "Assumption", layer: 1 },
  milestone: { color: "var(--bm-intel)", icon: Flag, label: "Milestone", layer: 1 },
  decision: { color: "var(--bm-purple)", icon: GitCommit, label: "Decision", layer: 1 },
  metric: { color: "var(--bm-indigo)", icon: BarChart3, label: "Metric", layer: 1 },
  task: { color: "var(--bm-blue)", icon: ListChecks, label: "Task", layer: 2 },
  action: { color: "var(--bm-teal)", icon: Zap, label: "Action", layer: 3 },
  outcome: { color: "var(--bm-green)", icon: CircleCheck, label: "Outcome", layer: 4 },
  evidence: { color: "var(--bm-violet)", icon: Search, label: "Evidence", layer: 5 },
};

const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 64;
const NODE_W = 168;
const NODE_H = 44;
const PADDING = 40;

interface LaidOutNode extends RelationshipNode {
  x: number;
  y: number;
}

function layout(nodes: RelationshipNode[]): LaidOutNode[] {
  const byLayer = new Map<number, RelationshipNode[]>();
  for (const n of nodes) {
    const layer = TYPE_META[n.type]?.layer ?? 6;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }
  const out: LaidOutNode[] = [];
  for (const [layer, layerNodes] of byLayer) {
    layerNodes.forEach((n, i) => {
      out.push({
        ...n,
        x: PADDING + layer * COLUMN_WIDTH,
        y: PADDING + i * ROW_HEIGHT,
      });
    });
  }
  return out;
}

export function RelationshipGraph({ graph }: { graph: StartupRelationshipGraph }) {
  const [activeTypes, setActiveTypes] = useState<Set<RelationshipNodeType>>(new Set(Object.keys(TYPE_META) as RelationshipNodeType[]));
  const [selected, setSelected] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleNodes = useMemo(() => graph.nodes.filter((n) => activeTypes.has(n.type)), [graph.nodes, activeTypes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [graph.edges, visibleIds],
  );
  const laidOut = useMemo(() => layout(visibleNodes), [visibleNodes]);
  const posById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  const connected = useMemo(() => {
    if (!selected) return null;
    const upstream = new Set<string>();
    const downstream = new Set<string>();
    const edgeSet = new Set<string>();
    let frontier = [selected];
    const seenUp = new Set(frontier);
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of graph.edges.filter((e) => e.to === id)) {
          edgeSet.add(`${e.from}->${e.to}`);
          if (!seenUp.has(e.from)) { seenUp.add(e.from); upstream.add(e.from); next.push(e.from); }
        }
      }
      frontier = next;
    }
    frontier = [selected];
    const seenDown = new Set(frontier);
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of graph.edges.filter((e) => e.from === id)) {
          edgeSet.add(`${e.from}->${e.to}`);
          if (!seenDown.has(e.to)) { seenDown.add(e.to); downstream.add(e.to); next.push(e.to); }
        }
      }
      frontier = next;
    }
    return { upstream, downstream, edgeSet };
  }, [selected, graph.edges]);

  const width = Math.max(600, (Math.max(0, ...laidOut.map((n) => n.x)) || 0) + COLUMN_WIDTH);
  const height = Math.max(300, (Math.max(0, ...laidOut.map((n) => n.y)) || 0) + ROW_HEIGHT + PADDING);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: transform.x, oy: transform.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [transform]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setTransform((t) => ({ ...t, x: dragState.current!.ox + dx, y: dragState.current!.oy + dy }));
  }, []);

  const onPointerUp = useCallback(() => { dragState.current = null; }, []);

  const zoom = (dir: 1 | -1) => setTransform((t) => ({ ...t, scale: Math.max(0.4, Math.min(2.2, t.scale + dir * 0.2)) }));
  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  const toggleType = (type: RelationshipNodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) ?? null : null;
  const typesPresent = useMemo(() => {
    const s = new Set<RelationshipNodeType>();
    graph.nodes.forEach((n) => s.add(n.type));
    return (Object.keys(TYPE_META) as RelationshipNodeType[]).filter((t) => s.has(t));
  }, [graph.nodes]);

  if (!graph.nodes.length) {
    return (
      <div className="flex items-center justify-center rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-8 text-[12px] text-[var(--bm-text4)]">
        No relationship data yet — this fills in as milestones, tasks, and reflections accumulate.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {typesPresent.map((type) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const active = activeTypes.has(type);
          const count = graph.nodes.filter((n) => n.type === type).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-medium transition-opacity"
              style={{
                borderColor: active ? meta.color : "var(--bm-border)",
                color: active ? meta.color : "var(--bm-text4)",
                background: active ? "var(--bm-bg3)" : "transparent",
                opacity: active ? 1 : 0.55,
              }}
            >
              <Icon size={11} />
              {meta.label}
              <span className="font-mono text-[9px]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-[var(--r-md)] border border-[var(--bm-border)]"
        style={{ background: "var(--bm-bg)", height: 380, touchAction: "none", cursor: dragState.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
          <button type="button" onClick={() => zoom(1)} className="rounded-md border border-[var(--bm-border2)] bg-[var(--bm-bg2)] p-1.5 text-[var(--bm-text3)] hover:text-[var(--bm-text)]"><ZoomIn size={13} /></button>
          <button type="button" onClick={() => zoom(-1)} className="rounded-md border border-[var(--bm-border2)] bg-[var(--bm-bg2)] p-1.5 text-[var(--bm-text3)] hover:text-[var(--bm-text)]"><ZoomOut size={13} /></button>
          <button type="button" onClick={resetView} className="rounded-md border border-[var(--bm-border2)] bg-[var(--bm-bg2)] p-1.5 text-[var(--bm-text3)] hover:text-[var(--bm-text)]"><Maximize2 size={13} /></button>
        </div>

        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            width,
            height,
            position: "relative",
          }}
        >
          <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            {visibleEdges.map((e, i) => {
              const a = posById.get(e.from);
              const b = posById.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
              const x2 = b.x, y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const dimmed = connected ? !connected.edgeSet.has(`${e.from}->${e.to}`) : false;
              return (
                <path
                  key={`${e.from}-${e.to}-${i}`}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={dimmed ? "var(--bm-border)" : "var(--bm-border2)"}
                  strokeWidth={dimmed ? 1 : 1.5}
                  opacity={dimmed ? 0.25 : 0.8}
                />
              );
            })}
          </svg>

          {laidOut.map((n) => {
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const isSelected = selected === n.id;
            const isConnected = connected ? connected.upstream.has(n.id) || connected.downstream.has(n.id) : false;
            const dimmed = selected ? !isSelected && !isConnected : false;
            return (
              <button
                key={n.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setSelected(isSelected ? null : n.id); }}
                className="absolute flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-opacity"
                style={{
                  left: n.x, top: n.y, width: NODE_W, height: NODE_H,
                  borderColor: isSelected ? meta.color : "var(--bm-border2)",
                  background: isSelected ? "var(--bm-bg2)" : "var(--bm-bg3)",
                  boxShadow: isSelected ? `0 0 0 1px ${meta.color}` : "none",
                  opacity: dimmed ? 0.25 : 1,
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                  style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}
                >
                  <Icon size={11} color={meta.color} />
                </span>
                <span className="truncate text-[10.5px] leading-tight text-[var(--bm-text2)]">{n.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel for the selected node */}
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] p-3.5"
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {(() => { const M = TYPE_META[selectedNode.type]; const I = M.icon; return <I size={13} color={M.color} />; })()}
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: TYPE_META[selectedNode.type].color }}>
                {TYPE_META[selectedNode.type].label}
              </span>
              {selectedNode.status && <span className="text-[10px] text-[var(--bm-text4)]">· {selectedNode.status}</span>}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-[var(--bm-text4)] hover:text-[var(--bm-text2)]"><X size={13} /></button>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--bm-text)]">{selectedNode.label}</p>
          {connected && (
            <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-[var(--bm-border)] pt-2.5 text-[11px] text-[var(--bm-text3)]">
              <div>{connected.upstream.size} node{connected.upstream.size === 1 ? "" : "s"} feed this</div>
              <div>{connected.downstream.size} node{connected.downstream.size === 1 ? "" : "s"} this feeds</div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
