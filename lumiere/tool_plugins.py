import ast
import json
from datetime import datetime, timezone


class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, name, description, fn):
        key = str(name or "").strip().lower()
        if not key:
            return
        self._tools[key] = {
            "name": key,
            "description": str(description or "").strip(),
            "fn": fn,
        }

    def list_tools(self):
        out = []
        for key in sorted(self._tools.keys()):
            row = self._tools[key]
            out.append({"name": row["name"], "description": row["description"]})
        return out

    def run(self, name, args=None):
        key = str(name or "").strip().lower()
        row = self._tools.get(key)
        if not row:
            return {"error": f"Unknown tool: {name}"}
        payload = args if isinstance(args, dict) else {}
        try:
            return {"ok": True, "tool": key, "result": row["fn"](payload)}
        except Exception as e:
            return {"error": f"Tool execution failed: {e}"}


def _safe_math_eval(expr):
    node = ast.parse(expr, mode="eval")
    for n in ast.walk(node):
        if not isinstance(
            n,
            (
                ast.Expression,
                ast.BinOp,
                ast.UnaryOp,
                ast.Num,
                ast.Constant,
                ast.Add,
                ast.Sub,
                ast.Mult,
                ast.Div,
                ast.FloorDiv,
                ast.Mod,
                ast.Pow,
                ast.USub,
                ast.UAdd,
                ast.Load,
                ast.Tuple,
            ),
        ):
            raise ValueError("Unsupported expression")
    return eval(compile(node, "<math_eval>", "eval"), {"__builtins__": {}}, {})


def register_builtin_tools(registry: ToolRegistry):
    registry.register(
        "time_now",
        "Returns current UTC and local timestamps.",
        lambda _: {
            "utc": datetime.now(timezone.utc).isoformat(),
            "local": datetime.now().isoformat(),
        },
    )
    registry.register(
        "math_eval",
        "Evaluates a safe arithmetic expression in args['expression'].",
        lambda args: {
            "expression": str(args.get("expression", "")).strip(),
            "value": _safe_math_eval(str(args.get("expression", "")).strip()),
        },
    )
    registry.register(
        "text_stats",
        "Returns line/word/character counts for args['text'].",
        lambda args: _text_stats(str(args.get("text", ""))),
    )


def _text_stats(text):
    lines = [ln for ln in str(text or "").splitlines() if ln.strip()]
    words = [w for w in str(text or "").split() if w.strip()]
    return {"lines": len(lines), "words": len(words), "chars": len(str(text or ""))}


def parse_tool_command(query_text: str):
    raw = str(query_text or "").strip()
    if not raw.lower().startswith("/tool "):
        return None
    body = raw[6:].strip()
    if not body:
        return {"error": "Usage: /tool <name> {json_args_optional}"}
    parts = body.split(maxsplit=1)
    name = parts[0].strip().lower()
    args = {}
    if len(parts) > 1:
        tail = parts[1].strip()
        if tail:
            try:
                parsed = json.loads(tail)
                if isinstance(parsed, dict):
                    args = parsed
            except Exception:
                # Fallback: pass raw as "text" for simple tools.
                args = {"text": tail, "expression": tail}
    return {"name": name, "args": args}
