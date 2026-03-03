from backend.app.agent.response_style import build_response_style_instruction, enforce_concise_answer
from backend.app.agent.tool_plugins import ToolRegistry, register_builtin_tools, parse_tool_command


def test_tool_registry_builtin_math_eval():
    reg = ToolRegistry()
    register_builtin_tools(reg)
    out = reg.run("math_eval", {"expression": "(12+3)*4"})
    assert out.get("ok") is True
    assert out.get("result", {}).get("value") == 60


def test_parse_tool_command_with_json_args():
    cmd = parse_tool_command('/tool math_eval {"expression":"2+2"}')
    assert cmd and cmd.get("name") == "math_eval"
    assert cmd.get("args", {}).get("expression") == "2+2"


def test_concise_enforcement_clips_long_text():
    long_text = "\n".join([f"Line {i}" for i in range(20)])
    clipped = enforce_concise_answer(long_text, enabled=True, is_coding=False, max_lines=5)
    assert "Line 0" in clipped
    assert "Line 10" not in clipped
    assert "Ask for details" in clipped


def test_detailed_query_overrides_concise_instruction():
    instr = build_response_style_instruction("concise", "Explain this in detail please", specialty="finance")
    assert "fuller detail" in instr.lower()
