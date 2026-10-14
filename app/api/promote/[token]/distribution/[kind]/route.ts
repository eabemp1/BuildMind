import { NextRequest } from "next/server";
import { isRes, requirePromoter } from "@/lib/distribution/guard";
import { create, list, patch, remove } from "@/lib/distribution/handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; kind: string }> };
const id = (r: NextRequest) => new URL(r.url).searchParams.get("id");

export async function GET(_r: NextRequest, { params }: Ctx) { const p = await params; const g = await requirePromoter(p.token); return isRes(g) ? g.res : list(g, p.kind); }
export async function POST(r: NextRequest, { params }: Ctx) { const p = await params; const g = await requirePromoter(p.token); return isRes(g) ? g.res : create(g, p.kind, await r.json().catch(() => null)); }
export async function PATCH(r: NextRequest, { params }: Ctx) { const p = await params; const g = await requirePromoter(p.token); return isRes(g) ? g.res : patch(g, p.kind, id(r), await r.json().catch(() => null)); }
export async function DELETE(r: NextRequest, { params }: Ctx) { const p = await params; const g = await requirePromoter(p.token); return isRes(g) ? g.res : remove(g, p.kind, id(r)); }
