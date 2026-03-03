import re


def answer_meta_attrs(
    agent_specialty,
    agent_level,
    used_memory=False,
    used_history=False,
    used_reminders=False,
    used_web=False,
):
    return (
        f'data-agent="{str(agent_specialty)}" '
        f'data-level="{int(agent_level)}" '
        f'data-used-memory="{1 if used_memory else 0}" '
        f'data-used-history="{1 if used_history else 0}" '
        f'data-used-reminders="{1 if used_reminders else 0}" '
        f'data-used-web="{1 if used_web else 0}"'
    )


def build_current_reminder_context(reminders, is_current_pending_reminder, limit=8):
    lines = []
    if not reminders:
        return ""
    for item in reminders[-max(1, int(limit)):]:
        if not is_current_pending_reminder(item):
            continue
        status = "done" if item.get("done") else "pending"
        lines.append(f"- [{status}] {item.get('text', '')}")
    if not lines:
        return ""
    return "Current reminder list:\n" + "\n".join(lines) + "\n"


def sanitize_prompt_context_for_stale_plans(history_ctx, inline_ctx="", reminder_context=""):
    if str(reminder_context or "").strip():
        return history_ctx, inline_ctx
    reminderish = re.compile(
        r"\b(remind|reminder|todo|task|deadline|due|tomorrow|next week|priority reminder|open-weight|open weight)\b",
        re.IGNORECASE,
    )

    def _strip_lines(block):
        text = str(block or "")
        if not text:
            return ""
        kept = [ln for ln in text.splitlines() if not reminderish.search(ln)]
        if not kept:
            return ""
        return "\n".join(kept).strip() + "\n"

    return _strip_lines(history_ctx), _strip_lines(inline_ctx)


def personalize_fact_for_actor(fact_text, actor_name):
    text = str(fact_text or "").strip()
    name = str(actor_name or "").strip() or "You"
    if not text:
        return text
    text = re.sub(r"^User\s*:\s*", f"{name}: ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUser wants to\b", f"{name} wants to", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUser wants\b", f"{name} wants", text, flags=re.IGNORECASE)
    text = re.sub(r"\bthe user\b", name, text, flags=re.IGNORECASE)
    return text


