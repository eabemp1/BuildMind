from __future__ import annotations


def render_welcome_page() -> str:
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Lumiere</title>
        <style>
            body { margin:0; height:100vh; background: linear-gradient(135deg, #0f172a, #0f766e 55%, #f97316); display:flex; justify-content:center; align-items:center; font-family: 'Segoe UI', sans-serif; color:white; }
            .card { background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); padding:3rem 2.5rem; border-radius:20px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.37); border:1px solid rgba(255,255,255,0.18); max-width:450px; width:90%; }
            h1 { font-size:2.8rem; margin-bottom:1.5rem; }
            p { font-size:1.2rem; margin-bottom:2rem; opacity:0.9; }
            input { width:100%; padding:14px; font-size:1.1rem; border:none; border-radius:10px; margin-bottom:1.5rem; }
            button { padding:14px 40px; font-size:1.1rem; background:#fff; color:#0b3b5b; border:none; border-radius:10px; cursor:pointer; }
            button:hover { background:#f0f0f0; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Welcome to Lumiere</h1>
            <p>I'm your personal, evolving AI companion. What's your name?</p>
            <form action="/set-name" method="post">
                <input type="text" name="name" placeholder="Your name..." required autocomplete="off">
                <button type="submit">Let's begin</button>
            </form>
        </div>
    </body>
    </html>
    """


def render_home_page(
    *,
    theme_class: str,
    accent_color: str,
    accent_rgb: str,
    current_model: str,
    safe_name: str,
    accent_options: str,
    model_options: str,
    active_model_label: str,
    specialist_count: int,
) -> str:
    return f"""
    <!DOCTYPE html>
    <html lang="en" class="{theme_class}" style="--accent: {accent_color}; --accent-rgb: {accent_rgb};">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lumiere</title>
        <link rel="stylesheet" href="/static/app.css?v=20260213-04">
        <script src="/static/app.js?v=20260213-04" defer></script>
    </head>
    <body data-current-model="{current_model}" data-accent="{accent_color}" data-user-name="{safe_name}">
        <div class="ambient-layer" aria-hidden="true">
            <div class="ambient-gradient"></div>
            <div class="ambient-grid"></div>
            <div class="ambient-wave ambient-wave-a"></div>
            <div class="ambient-wave ambient-wave-b"></div>
            <div class="orb orb-a"></div>
            <div class="orb orb-b"></div>
            <div class="orb orb-c"></div>
        </div>

        <div class="topbar">
            <div class="topbar-title">Lumiere</div>
            <div class="topbar-actions">
                <button class="topbar-btn" id="new-chat-btn">New Chat</button>
                <button class="topbar-btn" id="settings-open-btn">Settings</button>
            </div>
        </div>

        <div class="header">
            <div class="brand-wrap">
                <p class="eyebrow">Evolving AI Companion</p>
                <h1>Lumiere</h1>
                <p>{safe_name}'s AI workspace</p>
            </div>
            <div class="hero-metrics">
                <div class="metric-card">
                    <span>Specialists</span>
                    <strong>{specialist_count}</strong>
                </div>
                <div class="metric-card">
                    <span>Active Model</span>
                    <strong>{active_model_label}</strong>
                </div>
                <div class="metric-card">
                    <span>Mode</span>
                    <strong>Personal Companion</strong>
                </div>
            </div>
        </div>

        <div class="page-nav" id="page-nav">
            <label class="workspace-switch" for="workspace-select">
                <span>Go To</span>
                <select id="workspace-select" class="topbar-select" aria-label="Select page">
                    <option value="chat">Chat</option>
                    <option value="agents">Agents</option>
                    <option value="memory">Memory</option>
                    <option value="compare">Compare</option>
                    <option value="history">History</option>
                    <option value="reminders">Reminders</option>
                    <option value="marketplace">Marketplace</option>
                </select>
            </label>
        </div>

        <div class="container single-panel" id="app-container">
            <div class="agent-panel" id="agent-panel">
                <div class="panel-header">Companion Profile <span class="pill">Core</span></div>
                <div id="agents-view" class="tab-pane">
                    <div class="agent-stats"></div>
                    <div class="agent-memory-wrap">
                        <details id="training-guide-panel" open>
                            <summary>How To Improve Answers</summary>
                            <div class="train-guide">
                                <p><strong>Use thumbs:</strong> tap 👍 or 👎 after each answer.</p>
                                <p><strong>Use identity:</strong> memory changes based on your <em>Use As</em> name.</p>
                                <p><strong>Keep training:</strong> more feedback improves answer quality.</p>
                            </div>
                        </details>
                    </div>
                    <div class="reminder-wrap">
                        <details id="usage-log-panel">
                            <summary>Usage Log</summary>
                            <div id="usage-log-list" class="usage-log-list"></div>
                        </details>
                    </div>
                </div>
                <div id="memory-view" class="tab-pane" style="display:none;">
                    <div class="agent-memory-wrap">
                        <div class="memory-guide">
                            <h4>How memory works</h4>
                            <p>1. Save notes you want Lumiere to remember.</p>
                            <p>2. Use scope to control where each note applies.</p>
                            <p>3. Edit or delete notes anytime.</p>
                        </div>
                    </div>
                    <div class="agent-memory-wrap">
                        <details id="agent-memory-panel" open>
                            <summary>Agent Memory</summary>
                            <div id="agent-memory-meta" class="agent-memory-meta"></div>
                            <div id="agent-memory-history" class="agent-memory-history"></div>
                        </details>
                    </div>
                    <div class="agent-memory-wrap">
                        <details id="memory-management-panel" open>
                            <summary>Manage Memory</summary>
                            <div class="memory-controls">
                                <div id="memory-scope-list" class="memory-scope-list"></div>
                                <button id="memory-scopes-save-btn" type="button">Save</button>
                                <button id="memory-refresh-btn" type="button">Refresh</button>
                            </div>
                            <div class="memory-add-row">
                                <input id="memory-new-text" type="text" placeholder="Add a memory note..." autocomplete="off">
                                <select id="memory-new-scope">
                                    <option value="personal">Personal</option>
                                    <option value="shared">Shared</option>
                                    <option value="project">Project</option>
                                </select>
                                <button id="memory-add-btn" type="button">Add</button>
                            </div>
                            <div id="memory-items-list" class="memory-items-list"></div>
                        </details>
                    </div>
                </div>
                <div id="compare-view" class="tab-pane" style="display:none;">
                    <div class="reminder-wrap">
                        <details id="compare-panel" open>
                            <summary>Compare Agents</summary>
                            <div class="compare-toolbar">
                                <label class="compare-select-wrap">
                                    <span>Agent A</span>
                                    <select id="compare-agent-a"></select>
                                </label>
                                <label class="compare-select-wrap">
                                    <span>Agent B</span>
                                    <select id="compare-agent-b"></select>
                                </label>
                                <div class="compare-toggle" id="compare-toggle">
                                    <button type="button" class="compare-toggle-btn active" data-mode="radar">Radar</button>
                                    <button type="button" class="compare-toggle-btn" data-mode="table">Table</button>
                                </div>
                                <button id="compare-refresh-btn" type="button">Refresh</button>
                            </div>
                            <div id="compare-hero" class="compare-hero"></div>
                            <div id="compare-radar-wrap" class="compare-radar-wrap">
                                <svg id="compare-radar" viewBox="0 0 520 420" role="img" aria-label="Agent radar comparison"></svg>
                                <div id="compare-legend" class="compare-legend"></div>
                                <div id="compare-insight" class="compare-insight"></div>
                                <div id="compare-inline-tip" class="compare-inline-tip"></div>
                            </div>
                            <div id="agent-compare-list" class="agent-compare-list" style="display:none;"></div>
                        </details>
                    </div>
                </div>
                <div id="reminders-view" class="tab-pane" style="display:none;">
                    <div class="reminder-wrap">
                        <details id="reminder-panel" open>
                            <summary>Reminder Manager</summary>
                            <div class="reminder-input-row">
                                <input id="reminder-input" type="text" placeholder="Add a task/reminder..." autocomplete="off">
                                <button id="reminder-add-btn" type="button">Add</button>
                            </div>
                            <div id="reminder-list" class="reminder-list"></div>
                        </details>
                    </div>
                </div>
                <div id="history-view" class="tab-pane" style="display:none;">
                    <div class="reminder-wrap">
                        <details id="history-panel" open>
                            <summary>Chat History</summary>
                            <div class="reminder-input-row">
                                <input id="history-title-input" type="text" placeholder="Chat title..." autocomplete="off">
                                <button id="history-save-btn" type="button">Save Chat</button>
                            </div>
                            <div class="reminder-input-row">
                                <input id="history-search-input" type="text" placeholder="Search chats..." autocomplete="off">
                            </div>
                            <div id="history-list" class="history-list"></div>
                        </details>
                    </div>
                </div>
                <div id="marketplace-view" class="tab-pane" style="display:none;">
                    <div class="reminder-wrap">
                        <details id="marketplace-panel" open>
                            <summary>Marketplace Hub</summary>
                            <div id="marketplace-list" class="marketplace-list"></div>
                            <div id="marketplace-events" class="marketplace-events"></div>
                        </details>
                    </div>
                    <div class="reminder-wrap">
                        <details id="marketplace-manage-panel" open>
                            <summary>Your Agent Listings</summary>
                            <div id="marketplace-manage-list" class="marketplace-list"></div>
                        </details>
                    </div>
                    <div class="reminder-wrap">
                        <details open>
                            <summary>Hub Notes</summary>
                            <div class="train-guide">
                                <p><strong>List:</strong> Put your agent on the market with a price.</p>
                                <p><strong>Buy:</strong> Transfer ownership to another identity.</p>
                                <p><strong>Rent:</strong> Temporarily grant usage rights.</p>
                            </div>
                        </details>
                    </div>
                </div>
            </div>

            <div class="chat-panel" id="chat-panel">
                <div class="panel-header">Talk to Lumiere <span class="pill success">Personal Mode</span></div>
                <div class="panel-body">
                    <div id="onboarding-banner" class="onboarding-banner">
                        Ask your question, then rate the answer with 👍 or 👎 so Lumiere can improve.
                        <div class="onboarding-banner-actions">
                            <button id="onboarding-tour-btn" type="button">Take Tour</button>
                            <button id="onboarding-close" type="button">Dismiss</button>
                        </div>
                    </div>
                    <div id="error-ribbon" class="error-ribbon" aria-live="assertive"></div>
                    <div id="ai-avatar-block" class="ai-avatar-block" aria-live="polite">
                        <div class="ai-avatar-shell">
                            <div id="ai-avatar-core" class="ai-avatar-core"></div>
                        </div>
                        <div class="ai-avatar-meta">
                            <div class="ai-avatar-title">Lumiere Core</div>
                            <div class="ai-avatar-stats">
                                <span id="ai-avatar-stage">Stage 1</span>
                                <span id="ai-avatar-interactions">0 interactions</span>
                                <button id="avatar-reset-btn" type="button" class="avatar-reset-btn">Reset</button>
                            </div>
                        </div>
                    </div>
                    <div class="utility-row">
                        <div class="actor-switcher">
                            <span>Use As</span>
                            <input id="actor-input" type="text" value="{safe_name}" placeholder="Identity">
                            <button id="actor-apply-btn" type="button">Apply</button>
                        </div>
                        <div id="identity-hint" class="identity-hint"></div>
                        <label class="upload-btn" for="file-upload-input">Upload</label>
                        <input id="file-upload-input" type="file" accept=".txt,.md,.csv,.json,.pdf,image/*" hidden>
                        <button id="clear-uploaded-btn" type="button">Clear</button>
                        <button id="tts-toggle-btn" type="button">Voice Off</button>
                        <button id="privacy-quick-btn" type="button" title="Privacy settings">Privacy</button>
                        <button id="export-txt-btn" type="button">Export TXT</button>
                        <button id="export-json-btn" type="button">Export JSON</button>
                    </div>
                    <div id="uploaded-context-list" class="uploaded-context-list"></div>
                    <div class="upload-hint">Drop files here or use Upload.</div>
                    <div class="translate-controls">
                        <label class="translate-toggle">
                            <input id="auto-translate-toggle" type="checkbox">
                            <span>Auto Translate (Language Coach)</span>
                        </label>
                        <label>
                            <span>From</span>
                            <input id="translate-source-lang" type="text" value="auto" placeholder="auto">
                        </label>
                        <label>
                            <span>To</span>
                            <input id="translate-target-lang" type="text" value="en" placeholder="en">
                        </label>
                    </div>
                    <div class="prompt-row">
                        <button class="prompt-chip" data-prompt="Break this problem into 3 clear parts and give me an execution plan.">Plan</button>
                        <button class="prompt-chip" data-prompt="Give me a compact mission plan: goals, milestones, and checkpoints.">Goals</button>
                        <button class="prompt-chip" data-prompt="Run a fast readiness drill: ask me 5 hard questions and ideal responses.">Practice</button>
                    </div>
                    <div id="chat-output" class="chat-messages"></div>
                    <div id="loading" class="loading">
                        <div class="loading-text">Lumiere is thinking...</div>
                        <div class="loading-dots">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
                    <div class="input-area">
                        <textarea id="question" placeholder="Type your message..." rows="2"></textarea>
                        <button id="voice-btn" type="button" class="voice-btn" title="Voice input">Voice</button>
                        <button id="web-btn" type="button" class="web-btn" title="Live web search">Web</button>
                        <button id="debate-btn" type="button" class="debate-btn" title="Debate mode">Debate</button>
                        <button id="send-btn">Send</button>
                    </div>
                    <div id="remembers-footer" class="remembers-footer">Lumiere remembers: loading...</div>
                </div>
            </div>

            <!-- Metaverse view intentionally disabled -->
        </div>
        <div class="settings-overlay" id="settings-overlay"></div>
        <aside class="settings-drawer" id="settings-drawer" aria-hidden="true">
            <div class="settings-head">
                <h3>Settings</h3>
                <button id="settings-close-btn" type="button">Close</button>
            </div>
            <div class="settings-section">
                <label>Theme</label>
                <div class="theme-actions">
                    <button data-theme="light" onclick="setTheme('light')">Light</button>
                    <button data-theme="dark" onclick="setTheme('dark')">Dark</button>
                    <button data-theme="system" onclick="setTheme('system')">System</button>
                </div>
            </div>
            <div class="settings-section">
                <label for="accent-select">Accent</label>
                <select id="accent-select" onchange="setAccent(this.value)" aria-label="Select accent">
                    {accent_options}
                </select>
            </div>
            <div class="settings-section">
                <label for="model-select">Model</label>
                <select id="model-select" onchange="setModel(this.value)" aria-label="Select model">
                    {model_options}
                </select>
            </div>
            <div class="settings-section">
                <label class="privacy-toggle-row">
                    <input id="privacy-toggle" type="checkbox">
                    <span>Contribute anonymized usage data</span>
                </label>
                <p id="privacy-description" class="settings-help">
                    When enabled, only anonymized training signals are shared. Raw chats and files are not sent.
                </p>
            </div>
        </aside>
        <div id="tour-overlay" class="tour-overlay" aria-hidden="true">
            <div class="tour-card">
                <div class="tour-kicker">Quick Tour</div>
                <h3 id="tour-title">Welcome</h3>
                <p id="tour-text">Get a fast walkthrough of the core loop.</p>
                <div class="tour-actions">
                    <button id="tour-skip-btn" type="button">Skip</button>
                    <button id="tour-next-btn" type="button">Next</button>
                </div>
            </div>
        </div>
        <div id="reminder-alert-overlay" class="reminder-alert-overlay" aria-hidden="true">
            <div class="reminder-alert-card">
                <div class="reminder-alert-head">
                    <strong>Reminder Due</strong>
                    <button id="reminder-alert-close" type="button">Close</button>
                </div>
                <div id="reminder-alert-list" class="reminder-alert-list"></div>
            </div>
        </div>
        <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </body>
    </html>
    """
