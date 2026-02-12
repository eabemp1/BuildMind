from __future__ import annotations

import re
import urllib.parse
import urllib.request
from html import unescape as html_unescape
from urllib.error import HTTPError, URLError


def http_get_text(url: str, timeout: int = 10) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def _clean_html_fragment(raw: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", raw or "")
    return html_unescape(" ".join(cleaned.split())).strip()


def _extract_page_text(html: str, max_chars: int = 5000) -> str:
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", html or "")
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html_unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _unwrap_duckduckgo_link(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
        qs = urllib.parse.parse_qs(parsed.query)
        uddg = qs.get("uddg", [None])[0]
        if uddg:
            return urllib.parse.unquote(uddg)
    return url


def duckduckgo_search(query: str, max_results: int = 5) -> list[dict[str, str]]:
    encoded_q = urllib.parse.quote_plus(query)
    lite_url = f"https://lite.duckduckgo.com/lite/?q={encoded_q}"
    try:
        lite_html = http_get_text(lite_url, timeout=10)
    except Exception:
        lite_html = ""

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    if lite_html:
        lite_links = re.findall(
            r"(?is)<a(?=[^>]*class=['\"]result-link['\"])(?=[^>]*href=\"([^\"]+)\")[^>]*>(.*?)</a>",
            lite_html,
        )
        lite_snippets = re.findall(
            r"(?is)<td[^>]*class=['\"]result-snippet['\"][^>]*>(.*?)</td>",
            lite_html,
        )
        for idx, (href, title_html) in enumerate(lite_links):
            href_decoded = html_unescape(href)
            if href_decoded.startswith("//"):
                href_decoded = "https:" + href_decoded
            url = _unwrap_duckduckgo_link(href_decoded)
            if not url.startswith("http") or url in seen:
                continue
            seen.add(url)
            title = _clean_html_fragment(title_html)
            snippet = _clean_html_fragment(lite_snippets[idx] if idx < len(lite_snippets) else "")
            if not title:
                continue
            out.append({"title": title, "url": url, "snippet": snippet})
            if len(out) >= max_results:
                break
    if out:
        return out

    search_url = f"https://duckduckgo.com/html/?q={encoded_q}"
    try:
        html = http_get_text(search_url, timeout=10)
    except Exception:
        return []

    links = re.findall(
        r'(?is)<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        html,
    )
    snippets = re.findall(r'(?is)<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', html)
    if not snippets:
        snippets = re.findall(r'(?is)<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</div>', html)

    for idx, (href, title_html) in enumerate(links):
        url = _unwrap_duckduckgo_link(html_unescape(href))
        if not url.startswith("http") or url in seen:
            continue
        seen.add(url)
        title = _clean_html_fragment(title_html)
        snippet = _clean_html_fragment(snippets[idx] if idx < len(snippets) else "")
        if not title:
            continue
        out.append({"title": title, "url": url, "snippet": snippet})
        if len(out) >= max_results:
            break
    return out


def live_web_answer(question: str, ask_llm_fn, max_sources: int = 3, extra_context: str = ""):
    results = duckduckgo_search(question, max_results=6)
    if not results:
        return None, []

    sources = []
    for item in results:
        try:
            page_html = http_get_text(item["url"], timeout=8)
            page_text = _extract_page_text(page_html, max_chars=3200)
            if len(page_text) < 240:
                continue
            sources.append({
                "title": item["title"],
                "url": item["url"],
                "snippet": item["snippet"],
                "content": page_text,
            })
            if len(sources) >= max_sources:
                break
        except (HTTPError, URLError, TimeoutError, ValueError):
            continue
        except Exception:
            continue

    if not sources:
        for item in results[:max_sources]:
            snippet = (item.get("snippet") or "").strip()
            if not snippet:
                continue
            sources.append({
                "title": item.get("title", "Web result"),
                "url": item.get("url", ""),
                "snippet": snippet,
                "content": f"Snippet source: {snippet}",
            })
        if not sources:
            return None, []

    source_blocks = []
    for i, s in enumerate(sources, start=1):
        source_blocks.append(
            f"[Source {i}] {s['title']}\nURL: {s['url']}\nSnippet: {s['snippet']}\nContent: {s['content']}"
        )

    prompt = f"""
You are Lumiere. Use the web sources below to answer the user.
Rules:
- Prefer source-grounded statements.
- If sources conflict, mention that.
- End with a short \"Sources used: [1], [2]...\" line.
- Keep it concise and practical.

User question: {question}
{f"Extra context:\\n{extra_context}" if extra_context else ""}

{chr(10).join(source_blocks)}
"""
    answer_plain = ask_llm_fn(prompt)
    return answer_plain, sources
