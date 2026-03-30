"""Groq AI service helpers."""

import os
from typing import Any

import httpx


GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def generate_ai_response(messages: list[dict[str, str]], temperature: float = 0.7) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured.")

    payload: dict[str, Any] = {
        "model": DEFAULT_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=20.0) as client:
        response = client.post(GROQ_ENDPOINT, json=payload, headers=headers)
        if response.status_code >= 400:
            raise ValueError(f"Groq error {response.status_code}: {response.text}")
        body = response.json()

    content = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise ValueError("Groq response missing content.")
    return str(content)


def generate_milestones_from_idea(idea: str) -> list[str]:
    prompt = (
        "You are a startup advisor.\n"
        "Generate 10 actionable milestones for launching this startup idea.\n"
        f"Startup idea: {idea}\n"
        "Return each milestone as a short sentence, one per line."
    )
    content = generate_ai_response(
        messages=[
            {"role": "system", "content": "Return concise milestones only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
    )
    milestones = [line.strip("- ").strip() for line in content.splitlines() if line.strip()]
    return milestones[:10]
