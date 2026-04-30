"""
app/agent — BuildMind agent package

Public surface:
  from app.agent.khaya     import khaya_translate, khaya_tts, khaya_asr
  from app.agent.memory    import get_memory_items_for_actor, upsert_memory_item
  from app.agent.forge     import load_forge_state, create_checkpoint
  from app.agent.workspace import (live search / web answer helpers)

Route wiring is done in runtime.py via the register_*_routes() helpers.
"""
