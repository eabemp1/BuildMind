Fair check-in. Short answer: **no, Today isn't done, and Projects hasn't been touched in code at all.** Here's the precise state of both.

**Today — 6 of 9 states built, 3 open:**

| State | Status |
|---|---|
| Loading | ✅ Built |
| Calibration brief | ✅ Built (Context Alignment sidebar) |
| Check-in | ✅ Built (vertical list) |
| Unavailable | ✅ Built |
| Empty / no plan | ✅ Built |
| Execution mode | ⚠️ Partial — wired a real `mailto:` for "Email personally," but the channel picker is still the pre-existing Destinations tile grid, not Figma's chip-style "Choose channel & audience" selector with recipient count. Functionally similar, visually not a match. |
| Risk Interrupt | ❌ Not built — still blocked on the churn/NPS data-source decision you deferred |
| Recovery Mode | ❌ Not built — you decided "replace inactivity-based with risk-based," but that replacement needs the same churn signal source Risk Interrupt is blocked on. Decision made, implementation not started. |
| Reflection recorded ("BuildMind has recorded your insight") | ❌ Never started |

Plus Weekly Vigil chip and The Reckoning pill, which weren't in the original 9 but came from your task-first instruction — both built.

**Projects — wireframed only, zero real code:**

We built the clickable wireframe (`plan.html`) for Projects list, Create Project, and Project detail early on, then you said "keep building Today" and we never went back. Nothing in `app/(dashboard)/projects/` has been touched — it's still the compact-row list, modal-based Create Project, and tabbed detail page exactly as Codex left it.
