import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "./card";

export function ErrorState({ title = "Something went wrong", body, action }: { title?: string; body?: string; action?: ReactNode }) {
  return <Card variant="alert" className="flex flex-col items-start gap-3 p-5"><AlertCircle size={18} className="text-[var(--bm-red)]" /><div><h3 className="text-sm font-medium text-[var(--bm-text)]">{title}</h3>{body ? <p className="mt-1 text-xs leading-relaxed text-[var(--bm-text3)]">{body}</p> : null}</div>{action}</Card>;
}
