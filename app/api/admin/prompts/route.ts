import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdminUser } from "@/lib/server/adminAuth";
import {
  getAllActiveVersions,
  listPromptVersions,
  registerPromptVersion,
  revertPrompt,
  promptDiff,
  type PromptId,
} from "@/lib/promptRegistry";
import { getPromptQualitySummary } from "@/lib/aiEvaluator";

async function requireAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return Boolean(user?.id && await isAdminUser(user.id));
}

export async function GET(request: Request) {
  const authed = await requireAdminAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "versions") {
    const promptId = searchParams.get("promptId") as PromptId;
    const history = await listPromptVersions(promptId);
    return NextResponse.json({ data: history });
  }

  if (action === "quality") {
    const summary = await getPromptQualitySummary();
    return NextResponse.json({ data: summary });
  }

  if (action === "diff") {
    const promptId = searchParams.get("promptId") as PromptId;
    const vA = searchParams.get("vA") ?? "";
    const vB = searchParams.get("vB") ?? "";
    const diff = await promptDiff(promptId, vA, vB);
    return NextResponse.json({ data: diff });
  }

  const active = getAllActiveVersions();
  return NextResponse.json({ data: active });
}

export async function POST(request: Request) {
  const authed = await requireAdminAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, promptId, version, text, author, notes } = body as {
    action?: string;
    promptId?: PromptId;
    version?: string;
    text?: string;
    author?: string;
    notes?: string;
  };

  if (action === "register" && promptId && version && text && author) {
    const result = await registerPromptVersion({ id: promptId, version, text, author, notes });
    return NextResponse.json(result);
  }

  if (action === "revert" && promptId && version) {
    const result = await revertPrompt(promptId, version);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
