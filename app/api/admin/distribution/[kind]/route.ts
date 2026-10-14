import { NextRequest } from "next/server";
import { isRes, requireOwner } from "@/lib/distribution/guard";
import { create, list, patch, remove } from "@/lib/distribution/handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ kind: string }> };
const id = (r: NextRequest) => new URL(r.url).searchParams.get("id");

export async function GET(_r: NextRequest, { params }: Ctx) { const g = await requireOwner(); return isRes(g) ? g.res : list(g, (await params).kind); }
export async function POST(r: NextRequest, { params }: Ctx) { const g = await requireOwner(); return isRes(g) ? g.res : create(g, (await params).kind, await r.json().catch(() => null)); }
export async function PATCH(r: NextRequest, { params }: Ctx) { const g = await requireOwner(); return isRes(g) ? g.res : patch(g, (await params).kind, id(r), await r.json().catch(() => null)); }
export async function DELETE(r: NextRequest, { params }: Ctx) { const g = await requireOwner(); return isRes(g) ? g.res : remove(g, (await params).kind, id(r)); }
