"""
app/agent/workspace.py — Utility workspace

Extracted from runtime.py (Section 10, ~L4500–5200).
Covers: DuckDuckGo search, http_get_text, live_web_answer, debate endpoint,
        ask_live (real-time web-augmented answers), signal suggestions.

Import from here; do NOT add new utility logic to runtime.py.
"""

import re
import json
import logging
import asyncio
import sqlite3
import requests
from datetime import datetime, timezone
from typing import Optional

from fastapi import Body, Header

from app.agent.runtime import (
    APP_DB,
    log_event,
    resolve_requester_with_auth,
    auth_context_from_token,
)

logger = logging.getLogger(__name__)

    concise_on = bool(DEFAULT_CONCISE_MODE) and str(response_style).lower() == "concise" and not wants_detailed_response(q)
    answer_plain = enforce_concise_answer(answer_plain, enabled=concise_on, is_coding=(agent.specialty == "coding"))
    answer = answer_plain
    log_event(logging.INFO, "ask_llm_response", specialty=agent.specialty, answer_len=len(answer))

    due_nudges = due_reminder_nudges()
    if due_nudges:
        answer_plain = "\n".join(due_nudges) + "\n\n" + answer_plain
    message_id = str(uuid4())
    answer = format_ai_text_html(answer_plain)
    has_control = has_agent_control(agent.specialty, acting_as)
    eval_inc(acting_as, "ai_answers", 1)
    pending_review = False
    if has_control:
        if is_current_renter(agent.specialty, acting_as):
            pending_review = queue_pending_training_review(message_id, agent.specialty, acting_as, q, answer_plain)
        else:
            agent.add_interaction(q, answer_plain, user_id=acting_as)
            save_agents()
            train_token_from_signal(agent.specialty, usage_inc=1, requester_name=acting_as)
    update_global_core(interaction_inc=1)
    log_agent_message(agent.specialty)
    emit_global_event(
        "interaction",
        acting_as,
        agent.specialty,
        {
            "channel": "ask",
            "response_chars": len(answer_plain),
            "used_live_web": False,
            "had_upload_context": bool(uploaded_context),
            "has_control": bool(has_control),
        },
    )

    thumbs_html = f'''
    <div class="thumbs-rating">
        Was this helpful?
        <span class="thumb-up" data-value="1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Helpful">👍</span>
        <span class="thumb-down" data-value="-1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Not helpful">👎</span>
    </div>
    '''

    control_note = ""
    if not has_control:
        control_note = " · Read-only session (global learning only)"
    elif pending_review:
        control_note = " · Rented session: memory/training update is pending your 👍 approval"
    speech_attr = ""
    if agent.specialty == "language":
        req = _extract_direct_language_target_and_text(q)
        if req and req.get("target_code"):
            speech_attr = f' data-speech-lang="{html_escape(str(req["target_code"]))}"'
    answered_by = f'''
    <small class="answer-meta" {_answer_meta_attrs(agent, used_memory=bool(scoped_mem.strip()), used_history=bool(history_ctx.strip()), used_reminders=bool(reminder_context.strip()))}{speech_attr}>
        Answered by: {agent.name} ({agent.specialty} · Level {agent.level}){control_note}
    </small>
    '''

    full_response = answer + thumbs_html + answered_by

    return HTMLResponse(content=full_response, media_type="text/html")

@app.get("/debate")
async def debate(q: str, requester: Optional[str] = None, ctx: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
    log_event(logging.INFO, "debate_called", requester=requester, q_len=len(str(q or "")))
    if not q:
        return "Please provide a topic for debate."
    acting_as, auth_err, auth_ctx = resolve_requester_with_auth(requester, x_auth_token, allow_admin_impersonate=True)
    if auth_err:
        audit_log("debate", requester or "unknown", status="denied", metadata={"reason": auth_err})
        return HTMLResponse(content=html_escape(auth_err), media_type="text/html", status_code=403)
    audit_log("debate", acting_as, metadata={"q_len": len(str(q or ""))}, tenant_id=(auth_ctx or {}).get("tenant_id", "default"))
    last_specialty_by_user[normalize_actor_key(acting_as)] = "personal"

    agent_a, agent_b = choose_debate_agents(q)
    strict_a = strict_access_block(agent_a.specialty, acting_as)
    strict_b = strict_access_block(agent_b.specialty, acting_as)
    if strict_a or strict_b:
        reasons = []
        if strict_a:
            reasons.append(f"{agent_a.name}: {strict_a}")
        if strict_b:
            reasons.append(f"{agent_b.name}: {strict_b}")
        blocked = f"""
Debate unavailable due to strict access:
{html_escape(' | '.join(reasons))}
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="personal" data-level="1">
Strict access enabled.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")
    lock_a = rental_lock_for_requester(agent_a.specialty, acting_as)
    lock_b = rental_lock_for_requester(agent_b.specialty, acting_as)
    if lock_a or lock_b:
        blocked_agents = []
        if lock_a:
            blocked_agents.append(f"{agent_a.name} (rented by {lock_a.get('renter', 'another user')})")
        if lock_b:
            blocked_agents.append(f"{agent_b.name} (rented by {lock_b.get('renter', 'another user')})")
        blocked = f"""
Debate unavailable right now because rented agents are locked:
{html_escape(', '.join(blocked_agents))}
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="personal" data-level="1">
Rental lock active for debate.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")

    memory_a = agent_a.get_memory_summary(acting_as)
    memory_b = agent_b.get_memory_summary(acting_as)
    scoped_mem = scoped_memory_context(acting_as, limit=10)
    history_ctx = history_retrieval_context(acting_as, q, limit=4)
    inline_ctx = f"\nRecent visible conversation turns:\n{str(ctx).strip()[:2000]}\n" if ctx else ""
    core_block = global_core_prompt_block()
    checkpoint_block = active_checkpoint_prompt_block()
    upload_context = upload_context_block()

    prompt_a = f"""
{memory_a}
{scoped_mem}
{history_ctx}
{inline_ctx}
{upload_context}
{core_block}
{checkpoint_block}
{lumiere_system_prompt()}
{specialty_prompt_block(agent_a.specialty, q)}

You are Lumiere generating internal Perspective A.
{level_tone(agent_a.level)}
Debate task:
- Take the PRO side and argue for the idea.
- Give 3 concise points with one practical example.
Topic: {q}
"""
    prompt_b = f"""
{memory_b}
{scoped_mem}
{history_ctx}
{inline_ctx}
{upload_context}
{core_block}
{checkpoint_block}
{lumiere_system_prompt()}
{specialty_prompt_block(agent_b.specialty, q)}

You are Lumiere generating internal Perspective B.
{level_tone(agent_b.level)}
Debate task:
- Take the CAUTIONARY/CON side and challenge the idea.
- Give 3 concise points with one practical example.
Topic: {q}
"""

    model_a = resolve_model_key_for_specialty(agent_a.specialty, current_model)
    model_b = resolve_model_key_for_specialty(agent_b.specialty, current_model)
    log_event(logging.INFO, "debate_model_routing", side="a", specialty=agent_a.specialty, routed_model=model_a)
    log_event(logging.INFO, "debate_model_routing", side="b", specialty=agent_b.specialty, routed_model=model_b)
    answer_a_plain = ask_llm_with_model(prompt_a, model_a)
    answer_b_plain = ask_llm_with_model(prompt_b, model_b)
    answer_a_plain = sanitize_agent_output(answer_a_plain)
    answer_b_plain = sanitize_agent_output(answer_b_plain)
    answer_a_plain = normalize_legacy_vocabulary(answer_a_plain, q)
    answer_b_plain = normalize_legacy_vocabulary(answer_b_plain, q)

    synth_prompt = f"""
You are Lumiere, a neutral moderator.
Topic: {q}
{upload_context}
{core_block}

Perspective A:
{answer_a_plain}

Perspective B:
{answer_b_plain}

Now provide:
1) Key tradeoff summary (2-3 lines)
2) A balanced recommendation
3) A concrete next step the user can take today
Keep it concise and practical.
"""
    synth_model = resolve_model_key_for_specialty("personal", current_model)
    synthesis_plain = ask_llm_with_model(synth_prompt, synth_model)
    synthesis_plain = sanitize_agent_output(synthesis_plain)
    synthesis_plain = normalize_legacy_vocabulary(synthesis_plain, q)
    due_nudges = due_reminder_nudges()
    if due_nudges:
        synthesis_plain = "\n".join(due_nudges) + "\n\n" + synthesis_plain

    can_control_a = has_agent_control(agent_a.specialty, acting_as)
    can_control_b = has_agent_control(agent_b.specialty, acting_as)
    if can_control_a:
        agent_a.add_interaction(f"Debate topic (pro stance): {q}", answer_a_plain, user_id=acting_as)
    if can_control_b:
        agent_b.add_interaction(f"Debate topic (con stance): {q}", answer_b_plain, user_id=acting_as)
    personal_agent = get_or_create_agent("personal")
    can_control_personal = has_agent_control(personal_agent.specialty, acting_as)
    if can_control_personal:
        personal_agent.add_interaction(f"Debate synthesis topic: {q}", synthesis_plain, user_id=acting_as)
    save_agents()
    if can_control_a:
        train_token_from_signal(agent_a.specialty, usage_inc=1, requester_name=acting_as)
    if can_control_b:
        train_token_from_signal(agent_b.specialty, usage_inc=1, requester_name=acting_as)
    if can_control_personal:
        train_token_from_signal(personal_agent.specialty, usage_inc=1, requester_name=acting_as)
    update_global_core(interaction_inc=3)
    log_agent_message(agent_a.specialty)
    log_agent_message(agent_b.specialty)
    log_agent_message(personal_agent.specialty)
    eval_inc(acting_as, "ai_answers", 1)
    emit_global_event(
        "interaction",
        acting_as,
        personal_agent.specialty,
        {
            "channel": "debate",
            "response_chars": len(synthesis_plain),
            "used_live_web": False,
            "has_control": bool(can_control_personal),
        },
    )

    pro_html = format_ai_text_html(answer_a_plain)
    con_html = format_ai_text_html(answer_b_plain)
    synthesis_html = format_ai_text_html(synthesis_plain)

    safe_topic = html_escape(q)
    full_response = f"""
    <div class="debate-block">
        <div class="debate-topic">Debate Topic: {safe_topic}</div>
        <div class="debate-column pro">
            <div class="debate-head">Perspective A (Pro)</div>
            <div>{pro_html}</div>
        </div>
        <div class="debate-column con">
            <div class="debate-head">Perspective B (Caution)</div>
            <div>{con_html}</div>
        </div>
        <div class="debate-column synth">
            <div class="debate-head">Moderator Synthesis</div>
            <div>{synthesis_html}</div>
        </div>
        <small class="answer-meta" data-agent="personal" data-level="{personal_agent.level}">
            Debate by: {html_escape(agent_a.specialty)} vs {html_escape(agent_b.specialty)} · Synthesized by personal
        </small>
    </div>
    """
    return HTMLResponse(content=full_response, media_type="text/html")

@app.get("/ask-live")
async def ask_live(
    q: str,
    requester: Optional[str] = None,
    ctx: Optional[str] = None,
    force_specialty: Optional[str] = None,
    x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token"),
):
    log_event(logging.INFO, "ask_live_called", requester=requester, q_len=len(str(q or "")))
    if not q:
        return "Please ask a question."
    acting_as, auth_err, auth_ctx = resolve_requester_with_auth(requester, x_auth_token, allow_admin_impersonate=True)
    if auth_err:
        audit_log("ask_live", requester or "unknown", status="denied", metadata={"reason": auth_err})
        return HTMLResponse(content=html_escape(auth_err), media_type="text/html", status_code=403)
    audit_log("ask_live", acting_as, metadata={"q_len": len(str(q or ""))}, tenant_id=(auth_ctx or {}).get("tenant_id", "default"))
    forced = slugify_specialty(force_specialty or "")
    category, specialty, existing = detect_category_and_specialty(q)
    live_coding_intent = _looks_like_coding_request(q)
    live_language_intent = _looks_like_language_request(q)
    live_explicit_programming = _explicitly_requests_programming_output(q)
    if forced in AGENT_CATEGORY_KEYWORDS:
        category, specialty, existing = forced, forced, None
    if live_language_intent and not live_explicit_programming:
        category, specialty, existing = "language", "language", None
    elif live_coding_intent:
        category, specialty, existing = "coding", "coding", None
    agent = existing or get_or_create_agent(specialty, category=category, owner_name=acting_as)
    last_specialty_by_user[normalize_actor_key(acting_as)] = agent.specialty
    strict_block = strict_access_block(agent.specialty, acting_as)
    if strict_block:
        blocked = f"""
{html_escape(strict_block)}
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
Strict access enabled.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")
    rental_lock = rental_lock_for_requester(agent.specialty, acting_as)
    if rental_lock:
        renter = rental_lock.get("renter", "another user")
        expires_at = rental_lock.get("expires_at", "soon")
        blocked = f"""
Live web answer unavailable for this agent right now.
It is rented by {html_escape(str(renter))} until {html_escape(str(expires_at))}.
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
Rental lock active.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")

    # Fast-path for direct language translation prompts using Khaya.
    # This avoids LLM timeout paths when users ask for direct "answer in X" translation.
    if agent.specialty == "language" and KHAYA_API_KEY:
        direct_req = _extract_direct_language_target_and_text(q)
        if direct_req:
            direct_out = khaya_translate(direct_req["text"], "auto", direct_req["target_code"])
            translated = str(direct_out.get("translated_text", "")).strip()
            if translated:
                answer_plain = (
                    f"{translated}\n\n"
                    f"English gloss: {direct_req['text']}"
                )
                answer_plain = sanitize_agent_output(normalize_legacy_vocabulary(answer_plain, q))
                message_id = str(uuid4())
                has_control = has_agent_control(agent.specialty, acting_as)
                pending_review = False
                if has_control:
                    if is_current_renter(agent.specialty, acting_as):
                        pending_review = queue_pending_training_review(message_id, agent.specialty, acting_as, q, answer_plain)
                    else:
                        agent.add_interaction(q, answer_plain, user_id=acting_as)
                        save_agents()
                        train_token_from_signal(agent.specialty, usage_inc=1, requester_name=acting_as)
                update_global_core(interaction_inc=1)
                log_agent_message(agent.specialty)
                emit_global_event(
                    "interaction",
                    acting_as,
                    agent.specialty,
                    {
                        "channel": "ask_live",
                        "response_chars": len(answer_plain),
                        "used_live_web": False,
                        "has_control": bool(has_control),
                        "translate_provider": "khaya",
                    },
                )
                thumbs_html = f'''
                <div class="thumbs-rating">
                    Was this helpful?
                    <span class="thumb-up" data-value="1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Helpful">👍</span>
                    <span class="thumb-down" data-value="-1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Not helpful">👎</span>
                </div>
                '''
                control_note = ""
                if not has_control:
                    control_note = " · Read-only session (global learning only)"
                elif pending_review:
                    control_note = " · Rented session: memory/training update is pending your 👍 approval"
                answered_by = f'''
                <small class="answer-meta" {_answer_meta_attrs(agent)} data-speech-lang="{html_escape(direct_req['target_code'])}">
                    Live web answer by: {agent.name} ({agent.specialty} · Level {agent.level}){control_note}
                </small>
                '''
                return HTMLResponse(content=format_ai_text_html(answer_plain) + thumbs_html + answered_by, media_type="text/html")

    upload_context = upload_context_block()
    memory_summary = agent.get_memory_summary(acting_as)
    scoped_mem = scoped_memory_context(acting_as, limit=10)
    history_ctx = history_retrieval_context(acting_as, q, limit=4)
    inline_ctx = f"\nRecent visible conversation turns:\n{str(ctx).strip()[:2000]}\n" if ctx else ""
    checkpoint_block = active_checkpoint_prompt_block()
    routed_model_key = resolve_model_key_for_specialty(agent.specialty, current_model)
    log_event(
        logging.INFO,
        "ask_live_model_routing",
        specialty=agent.specialty,
        model=current_model,
        routed_model=routed_model_key,
    )
    answer_plain, sources = live_web_answer(
        q,
        max_sources=3,
        extra_context=(
            memory_summary
            + "\n"
            + scoped_mem
            + "\n"
            + history_ctx
            + inline_ctx
            + "\n"
            + upload_context
            + "\n"
            + global_core_prompt_block()
            + "\n"
            + checkpoint_block
            + "\n"
            + lumiere_system_prompt()
            + "\n"
            + specialty_prompt_block(agent.specialty, q)
            + "\n"
            + build_response_style_instruction(response_style, q, specialty=agent.specialty)
        ).strip(),
        ask_llm_fn=lambda prompt: ask_llm_with_model(prompt, routed_model_key),
    )
    if not _is_llm_failure_text(answer_plain) and agent.specialty == "language" and not live_coding_intent:
        if _has_code_block_or_code_like_text(answer_plain):
            answer_plain = _repair_language_response_without_code(
                previous_answer=answer_plain,
                user_query=q,
                model_key=routed_model_key,
            )
    answer_plain = normalize_legacy_vocabulary(answer_plain, q)
    answer_plain = sanitize_agent_output(answer_plain)
    concise_on = bool(DEFAULT_CONCISE_MODE) and str(response_style).lower() == "concise" and not wants_detailed_response(q)
    answer_plain = enforce_concise_answer(answer_plain, enabled=concise_on, is_coding=(agent.specialty == "coding"))
    if not answer_plain:
        fallback = "I couldn't fetch reliable live web sources right now. Please try again in a moment."
        fallback += """
<small class="answer-meta" data-agent="personal" data-level="1">
Live web fetch unavailable.
</small>
"""
        return HTMLResponse(content=fallback, media_type="text/html")

    due_nudges = due_reminder_nudges()
    if due_nudges:
        answer_plain = "\n".join(due_nudges) + "\n\n" + answer_plain

    answer = format_ai_text_html(answer_plain)
    sources_html = "".join(
        f'<li><a href="{html_escape(item["url"])}" target="_blank" rel="noopener noreferrer">{html_escape(item["title"])}</a></li>'
        for item in sources
    )
    references = f"""
    <div class="web-sources">
        <strong>Live Sources:</strong>
        <ul>{sources_html}</ul>
    </div>
    """

    message_id = str(uuid4())
    has_control = has_agent_control(agent.specialty, acting_as)
    pending_review = False
    if has_control:
        if is_current_renter(agent.specialty, acting_as):
            pending_review = queue_pending_training_review(
                message_id,
                agent.specialty,
                acting_as,
                f"Live web query: {q}",
                answer_plain
            )
        else:
            agent.add_interaction(f"Live web query: {q}", answer_plain, user_id=acting_as)
            save_agents()
            train_token_from_signal(agent.specialty, usage_inc=1, requester_name=acting_as)
    update_global_core(interaction_inc=1)
    log_agent_message(agent.specialty)
    emit_global_event(
        "interaction",
        acting_as,
        agent.specialty,
        {
            "channel": "ask_live",
            "response_chars": len(answer_plain),
            "source_count": len(sources or []),
            "used_live_web": True,
            "has_control": bool(has_control),
        },
    )
    thumbs_html = f'''
    <div class="thumbs-rating">
        Was this helpful?
        <span class="thumb-up" data-value="1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Helpful">👍</span>
        <span class="thumb-down" data-value="-1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Not helpful">👎</span>
    </div>
    '''

    control_note = ""
    if not has_control:
        control_note = " · Read-only session (global learning only)"
    elif pending_review:
        control_note = " · Rented session: memory/training update is pending your 👍 approval"
    speech_attr = ""
    if agent.specialty == "language":
        req = _extract_direct_language_target_and_text(q)
        if req and req.get("target_code"):
            speech_attr = f' data-speech-lang="{html_escape(str(req["target_code"]))}"'
    answered_by = f'''
    <small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}"{speech_attr}>
        Live web answer by: {agent.name} ({agent.specialty} · Level {agent.level}){control_note}
    </small>
    '''

    full_response = answer + references + thumbs_html + answered_by
    eval_inc(acting_as, "ai_answers", 1)
    return HTMLResponse(content=full_response, media_type="text/html")

@app.post("/rate")
async def rate(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
    message_id = data.get("message_id")
    raw_value = data.get("value")
    agent_specialty = str(data.get("agent", "")).strip().lower() or "personal"
    acting_as, auth_err, _ = resolve_requester_with_auth(data.get("requester"), x_auth_token, allow_admin_impersonate=True)
    if auth_err:
        return {"error": auth_err}

    if message_id is None or raw_value is None:
        print("[SERVER] Missing message_id or value")
        return {"error": "Missing data"}
    try:
        value = int(raw_value)
    except Exception:
        return {"error": "Invalid value"}
    try:
        raw_weight = float(data.get("weight", 1.0))
    except Exception:
        raw_weight = 1.0
    weight = max(0.3, min(2.5, raw_weight))

    log_event(logging.INFO, "rating_received", value=value, message_id=message_id, specialty=agent_specialty, requester=acting_as)
    if value > 0:
        eval_inc(acting_as, "ratings_up", 1)
        eval_inc(acting_as, "task_success", 1)
    else:
        eval_inc(acting_as, "ratings_down", 1)
        eval_inc(acting_as, "task_fail", 1)
        eval_inc(acting_as, "hallucination_reports", 1)

    updated = False
    review_status = "not_applicable"
    has_control = has_agent_control(agent_specialty, acting_as)
    for agent in squad:
        if agent.specialty == agent_specialty:
            old = float(agent.accuracy)
            if has_control:
                delta = (0.35 * weight) if value > 0 else (-0.35 * weight)
                _, leveled = apply_agent_training_feedback(
                    agent,
                    accuracy_delta=delta,
                    positive_signal=(0.6 * weight if value > 0 else 0),
                    learning_signal=(0.15 * weight if value > 0 else 0.35 * weight),
                )
                if leveled:
                    log_event(logging.INFO, "agent_leveled", specialty=agent.specialty, level=agent.level)

            log_event(logging.INFO, "agent_feedback_applied", specialty=agent.specialty, old_accuracy=round(old, 2), new_accuracy=round(agent.accuracy, 2), has_control=has_control)
            updated = True
            break

    if has_control and is_current_renter(agent_specialty, acting_as):
        pending_item = pop_pending_training_review(message_id, agent_specialty, acting_as)
        if pending_item:
            if value > 0:
                target_agent = next((a for a in squad if a.specialty == agent_specialty), None)
                if target_agent:
                    target_agent.add_interaction(
                        pending_item.get("question", ""),
                        pending_item.get("answer", ""),
                        user_id=acting_as
                    )
                    save_agents()
                    train_token_from_signal(agent_specialty, usage_inc=1, requester_name=acting_as)
                    review_status = "accepted_saved"
                else:
                    review_status = "accepted_agent_missing"
            else:
                review_status = "rejected_discarded"
        else:
            review_status = "pending_not_found"

    if not updated:
        log_event(logging.WARNING, "rating_agent_missing", specialty=agent_specialty)
    else:
        log_agent_rating(agent_specialty, value)
        update_global_core(rating_value=value)
        token, _ = _get_token_for_specialty(agent_specialty, requester_name=acting_as)
        if token:
            if has_control and value > 0:
                train_token_from_signal(agent_specialty, rating_value=value, usage_inc=0, requester_name=acting_as)
            elif has_control:
                token["value_score"] = round(max(0.5, float(token.get("value_score", 1.0)) - 0.04), 3)
                token["last_train_at"] = now_iso()
                save_chain_state()
    emit_global_event(
        "rating",
        acting_as,
        agent_specialty,
        {
            "rating_value": int(value),
            "has_control": bool(has_control),
            "review_status": str(review_status),
        },
    )

    forge_linked = False
    forge_error = None
    try:
        forge_result = apply_forge_event(
            forge_state,
            normalize_actor_key,
            now_iso,
            acting_as,
            event_type=("thumb_up" if value > 0 else "thumb_down"),
            value=abs(float(value)),
            agent_key=agent_specialty,
            metadata={
                "source": "rate_endpoint",
                "message_id": str(message_id),
                "review_status": str(review_status),
            },
        )
        if forge_result.get("error"):
            forge_error = str(forge_result.get("error"))
        else:
            save_forge_state()
            forge_linked = True
    except Exception as e:
        forge_error = str(e)
        log_event(logging.WARNING, "forge_rating_bridge_error", error=forge_error, requester=acting_as, specialty=agent_specialty)

    save_agents()
    return {
        "status": "ok",
        "mode": ("agent_and_global" if has_control else "global_only"),
        "review_status": review_status,
        "forge_linked": forge_linked,
        "forge_error": forge_error,
    }

@app.post("/signal/suggestion")
async def signal_suggestion(data: dict = Body(...)):
    prompt = str(data.get("prompt", "")).strip()
    requester = data.get("requester")
    acting_as = effective_requester_name(requester)
    specialty_raw = str(data.get("specialty", "")).strip().lower()

    if not prompt:
        return {"status": "ignored", "reason": "empty_prompt"}

    if specialty_raw:
        specialty = slugify_specialty(specialty_raw)
        category = specialty
        existing = next((a for a in squad if a.specialty == specialty), None)
    else:
        category, specialty, existing = detect_category_and_specialty(prompt)
    agent = existing or get_or_create_agent(specialty, category=category, owner_name=acting_as)

    has_control = has_agent_control(agent.specialty, acting_as)
    if not has_control:
        update_global_core(interaction_inc=1)
        emit_global_event(
            "suggestion_signal",
            acting_as,
            agent.specialty,
            {"leveled": False, "mode": "global_only"},
        )
        return {"status": "ok", "mode": "global_only", "specialty": agent.specialty}

    old_accuracy, leveled = apply_agent_training_feedback(
        agent,
        accuracy_delta=0.35,
        positive_signal=0.5,
    )
    save_agents()
    train_token_from_signal(agent.specialty, usage_inc=1, rating_value=1, requester_name=acting_as)
    update_global_core(interaction_inc=1)
    log_agent_message(agent.specialty)
    emit_global_event(
        "suggestion_signal",
        acting_as,
        agent.specialty,
        {
            "leveled": bool(leveled),
            "mode": "agent_and_global",
        },
    )
    log_event(logging.INFO, "suggestion_applied", specialty=agent.specialty, old_accuracy=round(old_accuracy, 2), new_accuracy=round(agent.accuracy, 2))
    if leveled:
        log_event(logging.INFO, "agent_leveled", specialty=agent.specialty, level=agent.level, source="suggestion")
    return {"status": "ok", "mode": "agent_and_global", "specialty": agent.specialty, "leveled": leveled}

