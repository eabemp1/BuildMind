import re


DETAIL_REQUEST_CUES = (
    "in detail",
    "detailed",
    "deep dive",
    "step by step",
    "thorough",
    "explain more",
    "full explanation",
)


def wants_detailed_response(user_query: str):
    q = str(user_query or "").lower()
    return any(cue in q for cue in DETAIL_REQUEST_CUES)


def build_response_style_instruction(style: str, user_query: str = "", specialty: str = "personal"):
    normalized = str(style or "concise").strip().lower()
    if normalized not in {"concise", "balanced", "detailed"}:
        normalized = "concise"
    if wants_detailed_response(user_query):
        normalized = "detailed"

    if normalized == "detailed":
        return "Use fuller detail with explicit reasoning and examples."
    if normalized == "balanced":
        return "Keep answers practical and moderately brief."
    if str(specialty or "").strip().lower() == "coding":
        return "Keep explanation brief after the code. Focus on actionable implementation."
    return (
        "Be direct and concise. Lead with the answer first. "
        "Use at most 5 short bullets or 5 short sentences unless asked for detail."
    )


def enforce_concise_answer(answer_text: str, enabled: bool = True, is_coding: bool = False, max_chars: int = 900, max_lines: int = 8):
    text = str(answer_text or "").strip()
    if not enabled or not text or is_coding:
        return text
    if "```" in text:
        return text
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    clipped_lines = lines[:max(1, int(max_lines))]
    clipped = "\n".join(clipped_lines).strip()
    if len(clipped) > max_chars:
        clipped = clipped[:max_chars].rstrip()
    if len(lines) > len(clipped_lines) or len(text) > len(clipped):
        clipped += "\n(Ask for details if you want a deeper breakdown.)"
    return clipped
