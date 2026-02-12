import sys
import types


class _DummyGroq:
    def __init__(self, api_key=None):
        self.api_key = api_key
        self.chat = types.SimpleNamespace(
            completions=types.SimpleNamespace(create=self._create)
        )

    def _create(self, **kwargs):
        msg = types.SimpleNamespace(content="ok")
        choice = types.SimpleNamespace(message=msg)
        return types.SimpleNamespace(choices=[choice])


def pytest_sessionstart(session):
    if "groq" not in sys.modules:
        mod = types.ModuleType("groq")
        mod.Groq = _DummyGroq
        sys.modules["groq"] = mod
