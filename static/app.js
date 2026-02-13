function hexToRgbString(hex) {
    const clean = (hex || "").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "34, 211, 238";
    const int = parseInt(clean, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `${r}, ${g}, ${b}`;
}

function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(el._timer);
    el._timer = window.setTimeout(() => el.classList.remove("show"), 1800);
}

function setErrorRibbon(message) {
    const el = document.getElementById("error-ribbon");
    if (!el) return;
    const text = String(message || "").trim();
    if (!text) {
        el.classList.remove("show");
        el.textContent = "";
        return;
    }
    el.textContent = text;
    el.classList.add("show");
}

function applyTheme(theme) {
    if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.className = isDark ? "theme-dark" : "theme-light";
    } else {
        document.documentElement.className = theme === "dark" ? "theme-dark" : "theme-light";
    }
    document.querySelectorAll(".theme-actions button[data-theme]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.theme === theme);
    });
}

function setTheme(theme) {
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    fetch("/set-theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme })
    }).catch(() => {});
}

function setAccent(color) {
    const rgb = hexToRgbString(color);
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent-rgb", rgb);
    if (document.body) {
        document.body.style.setProperty("--accent", color);
        document.body.style.setProperty("--accent-rgb", rgb);
    }
    localStorage.setItem("accent", color);
    fetch("/set-accent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: color })
    }).catch(() => {});
}

function setModel(model) {
    fetch("/set-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model })
    })
    .then((res) => res.json())
    .then((data) => {
        if (data.status === "ok") {
            toast(`Model switched to ${model}`);
        } else {
            toast("Model switch failed");
        }
    })
    .catch(() => toast("Model switch failed"));
}

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const AVATAR_STORAGE_KEY = "lumiere_avatar_state_v2";
let currentAgentSpecialty = "personal";
let lastFailedRequest = null;
const ONBOARDING_KEY = "lumiere_onboarding_dismissed_v1";
const ONBOARDING_TOUR_KEY = "lumiere_onboarding_tour_done_v1";
const TTS_KEY = "lumiere_tts_enabled_v1";
const AUTO_TRANSLATE_KEY = "lumiere_auto_translate_v1";
const TRANSLATE_SOURCE_KEY = "lumiere_translate_source_lang_v1";
const TRANSLATE_TARGET_KEY = "lumiere_translate_target_lang_v1";
const ACTOR_KEY = "lumiere_actor_v1";
const VIEW_KEY = "lumiere_view_v1";
const PROFILE_SEEN_KEY = "lumiere_profile_seen_v1";
const AGENT_AVATAR_PROFILE_KEY = "lumiere_agent_avatar_profiles_v1";
const AUTH_TOKEN_KEY = "lumiere_auth_token_v1";
const AUTH_USER_KEY = "lumiere_auth_user_v1";
const chatLog = [];
let metaverseAgents = [];
let metaverseFeatures = [];
let metaverseVideos = [];
let metaverseState = { zones: [], me: null, online: [] };
let selectedMetaverseVideo = null;
let lastAskedQuestion = "";
let reminderAudioCtx = null;
let reminderAudioReady = false;
let authModeRequired = false;
let historySessionsCache = [];
let tourStep = 0;
let compareMode = "radar";
let usageRowsBySpecialty = {};
let reminderItemsCache = [];
let memoryTickerFacts = [];
let memoryTickerIndex = 0;
let reminderAlertSeen = new Map();
let reminderSpeechRepeatTimer = null;

function openSettingsDrawer() {
    const drawer = document.getElementById("settings-drawer");
    const overlay = document.getElementById("settings-overlay");
    if (drawer) drawer.classList.add("open");
    if (overlay) overlay.classList.add("open");
}

function closeSettingsDrawer() {
    const drawer = document.getElementById("settings-drawer");
    const overlay = document.getElementById("settings-overlay");
    if (drawer) drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
}

function getAuthToken() {
    return (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
}

function setAuthToken(token) {
    const clean = (token || "").trim();
    if (clean) {
        localStorage.setItem(AUTH_TOKEN_KEY, clean);
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

function setAuthUser(user) {
    if (user && typeof user === "object") {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(AUTH_USER_KEY);
    }
}

function setAuthModeDescription(enabled) {
    const el = document.getElementById("auth-mode-description");
    if (!el) return;
    el.textContent = enabled
        ? "On: users must login for protected actions."
        : "Off: demo mode. On: users must login for protected actions.";
}

function getAuthUser() {
    try {
        return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
    } catch (_) {
        return null;
    }
}

const _nativeFetch = window.fetch.bind(window);
window.fetch = async function(input, init = {}) {
    try {
        const token = getAuthToken();
        if (!token) return _nativeFetch(input, init);
        const reqUrl = typeof input === "string" ? input : (input?.url || "");
        const url = new URL(reqUrl, window.location.origin);
        if (url.origin !== window.location.origin) return _nativeFetch(input, init);
        const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined) || {});
        if (!headers.has("X-Auth-Token")) {
            headers.set("X-Auth-Token", token);
        }
        return _nativeFetch(input, { ...init, headers });
    } catch (_) {
        return _nativeFetch(input, init);
    }
};

function getActingAs() {
    return (localStorage.getItem(ACTOR_KEY) || document.body?.dataset.userName || "local_user").trim();
}

function setActingAs(name, options = {}) {
    const cleaned = (name || "").trim() || (document.body?.dataset.userName || "local_user");
    localStorage.setItem(ACTOR_KEY, cleaned);
    const input = document.getElementById("actor-input");
    if (input) input.value = cleaned;
    refreshIdentityHint();
    refreshMetaverseState();
    refreshPrivacySetting();
    if (!options.silent) {
        toast(`Acting as ${cleaned}`);
    }
}

function syncActorWithProfileIfProfileChanged() {
    const profileName = (document.body?.dataset.userName || "local_user").trim();
    const seen = (localStorage.getItem(PROFILE_SEEN_KEY) || "").trim();
    if (!seen) {
        localStorage.setItem(PROFILE_SEEN_KEY, profileName);
        if (!localStorage.getItem(ACTOR_KEY)) {
            localStorage.setItem(ACTOR_KEY, profileName);
        }
        return;
    }
    if (seen !== profileName) {
        localStorage.setItem(PROFILE_SEEN_KEY, profileName);
        localStorage.setItem(ACTOR_KEY, profileName);
    }
}

function refreshIdentityHint() {
    const el = document.getElementById("identity-hint");
    if (!el) return;
    const profileName = (document.body?.dataset.userName || "local_user").trim();
    const actor = getActingAs();
    el.textContent = `Profile: ${profileName} | Use As: ${actor}`;
}

function setPrivacyDescription(enabled) {
    const el = document.getElementById("privacy-description");
    if (!el) return;
    if (enabled) {
        el.textContent = "Enabled: only anonymized training signals are shared. Raw chats/files stay local.";
    } else {
        el.textContent = "Disabled: your usage data does not contribute to global anonymized learning.";
    }
}

async function refreshPrivacySetting() {
    const toggle = document.getElementById("privacy-toggle");
    if (!toggle) return;
    try {
        const requester = getActingAs();
        const res = await fetch(`/privacy/share-anonymized?requester=${encodeURIComponent(requester)}`);
        const data = await res.json();
        const enabled = !!data.share_anonymized;
        toggle.checked = enabled;
        setPrivacyDescription(enabled);
    } catch (_) {}
}

async function savePrivacySetting(enabled) {
    const requester = getActingAs();
    try {
        const res = await fetch("/privacy/share-anonymized", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requester, enabled: !!enabled })
        });
        const data = await res.json();
        const val = !!data.share_anonymized;
        setPrivacyDescription(val);
        toast(`Anonymized sharing ${val ? "enabled" : "disabled"}`);
    } catch (_) {
        toast("Failed to update privacy setting");
    }
}

function applyView(view) {
    const container = document.getElementById("app-container");
    const agentPanel = document.getElementById("agent-panel");
    const chatPanel = document.getElementById("chat-panel");
    const workspaceSelect = document.getElementById("workspace-select");
    const agentPanelHeader = document.querySelector("#agent-panel .panel-header");
    const agentsView = document.getElementById("agents-view");
    const memoryView = document.getElementById("memory-view");
    const compareView = document.getElementById("compare-view");
    const historyView = document.getElementById("history-view");
    const remindersView = document.getElementById("reminders-view");
    const marketplaceView = document.getElementById("marketplace-view");
    const metaverseView = document.getElementById("metaverse-view");
    const tabs = document.querySelectorAll(".page-tab[data-view]");
    const training = document.getElementById("training-guide-panel");
    const memory = document.getElementById("agent-memory-panel");
    const memoryMgmt = document.getElementById("memory-management-panel");
    const usage = document.getElementById("usage-log-panel");
    const history = document.getElementById("history-panel");
    const reminders = document.getElementById("reminder-panel");
    const market = document.getElementById("marketplace-panel");

    if (!container || !agentPanel || !chatPanel) return;
    const compare = document.getElementById("compare-panel");
    const mode = ["chat", "agents", "memory", "compare", "history", "reminders", "marketplace"].includes(view) ? view : "chat";
    localStorage.setItem(VIEW_KEY, mode);
    if (workspaceSelect) workspaceSelect.value = mode;

    tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === mode));

    container.classList.add("single-panel");
    agentPanel.style.display = "none";
    chatPanel.style.display = "none";
    if (metaverseView) metaverseView.style.display = "none";
    if (training) training.style.display = "none";
    if (memory) memory.style.display = "none";
    if (memoryMgmt) memoryMgmt.style.display = "none";
    if (usage) usage.style.display = "none";
    if (history) history.style.display = "none";
    if (reminders) reminders.style.display = "none";
    if (market) market.style.display = "none";
    if (compare) compare.style.display = "none";
    if (agentsView) agentsView.style.display = "none";
    if (memoryView) memoryView.style.display = "none";
    if (compareView) compareView.style.display = "none";
    if (historyView) historyView.style.display = "none";
    if (remindersView) remindersView.style.display = "none";
    if (marketplaceView) marketplaceView.style.display = "none";

    if (mode === "chat") {
        chatPanel.style.display = "flex";
        chatPanel.classList.remove("view-enter");
        void chatPanel.offsetWidth;
        chatPanel.classList.add("view-enter");
        if (agentPanelHeader) agentPanelHeader.innerHTML = `Companion Profile <span class="pill">Core</span>`;
    } else {
        agentPanel.style.display = "block";
        agentPanel.classList.remove("view-enter");
        void agentPanel.offsetWidth;
        agentPanel.classList.add("view-enter");
        if (mode === "agents") {
            if (agentsView) agentsView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `Agents <span class="pill">Overview</span>`;
            if (training) training.style.display = "block";
            if (usage) usage.style.display = "block";
            if (training) training.open = true;
            if (usage) usage.open = true;
        } else if (mode === "memory") {
            if (memoryView) memoryView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `Memory <span class="pill">Control</span>`;
            if (memory) memory.style.display = "block";
            if (memoryMgmt) memoryMgmt.style.display = "block";
            if (memory) memory.open = true;
            if (memoryMgmt) memoryMgmt.open = true;
        } else if (mode === "compare") {
            if (compareView) compareView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `Compare <span class="pill">Visual</span>`;
            if (compare) compare.style.display = "block";
            if (compare) compare.open = true;
            renderAgentComparison();
        } else if (mode === "history") {
            if (historyView) historyView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `History <span class="pill">Saved</span>`;
            if (history) history.style.display = "block";
            if (history) history.open = true;
            refreshHistoryList();
        } else if (mode === "reminders") {
            if (remindersView) remindersView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `Reminders <span class="pill">Tasks</span>`;
            if (reminders) reminders.style.display = "block";
            if (reminders) reminders.open = true;
        } else if (mode === "marketplace") {
            if (marketplaceView) marketplaceView.style.display = "block";
            if (agentPanelHeader) agentPanelHeader.innerHTML = `Marketplace <span class="pill">Chain</span>`;
            if (market) market.style.display = "block";
            if (market) market.open = true;
        }
    }
}

async function startNewChat() {
    if (chatLog.length) {
        await saveCurrentChatToHistory();
    }
    const requester = getActingAs();
    try {
        await fetch("/session/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requester })
        });
    } catch (_) {}
    const output = document.getElementById("chat-output");
    if (output) output.innerHTML = "";
    chatLog.length = 0;
    lastFailedRequest = null;
    applyView("chat");
    toast("Started a new chat");
}

function loadAvatarState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) || "{}");
        const interactions = Number(parsed.interactions || 0);
        return {
            interactions: Number.isFinite(interactions) && interactions > 0 ? interactions : 0
        };
    } catch (_) {
        return { interactions: 0 };
    }
}

function saveAvatarState(state) {
    try {
        localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
}

function interactionToScale(interactions) {
    return Math.min(1 + Math.log1p(interactions) / Math.log(6), 2.35);
}

function renderAvatar(state, pulse) {
    const core = document.getElementById("ai-avatar-core");
    const stageEl = document.getElementById("ai-avatar-stage");
    const interactionsEl = document.getElementById("ai-avatar-interactions");
    if (!core || !stageEl || !interactionsEl) return;

    const interactions = Number(state.interactions || 0);
    const stage = Math.floor(Math.sqrt(interactions) / 2) + 1;
    const scale = interactionToScale(interactions);

    core.style.setProperty("--avatar-scale", scale.toFixed(3));
    stageEl.textContent = `Stage ${stage}`;
    interactionsEl.textContent = `${interactions} interactions`;

    if (pulse) {
        core.classList.remove("pulse");
        void core.offsetWidth;
        core.classList.add("pulse");
    }
}

function growAvatarByInteraction() {
    const state = loadAvatarState();
    state.interactions += 1;
    saveAvatarState(state);
    renderAvatar(state, true);
}

function resetAvatar() {
    const fresh = { interactions: 0 };
    saveAvatarState(fresh);
    renderAvatar(fresh, false);
    fetch("/memory/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester: getActingAs(), clear_reminders: true })
    }).catch(() => {});
    const output = document.getElementById("chat-output");
    if (output) output.innerHTML = "";
    chatLog.length = 0;
    toast("Memory reset and avatar growth cleared");
}

function setBusy(isBusy) {
    const loading = document.getElementById("loading");
    const sendBtn = document.getElementById("send-btn");
    const debateBtn = document.getElementById("debate-btn");
    const webBtn = document.getElementById("web-btn");
    const voiceBtn = document.getElementById("voice-btn");
    if (loading) loading.classList.toggle("active", isBusy);
    if (sendBtn) sendBtn.disabled = isBusy;
    if (debateBtn) debateBtn.disabled = isBusy;
    if (webBtn) webBtn.disabled = isBusy;
    if (voiceBtn) voiceBtn.disabled = isBusy;
}

function parseAgentMetaFromHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const meta = tmp.querySelector(".answer-meta");
    if (!meta) return null;
    return {
        specialty: meta.dataset.agent || "personal",
        level: Number(meta.dataset.level || 1)
    };
}

function parseAnswerTextForTranslation(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    tmp.querySelectorAll(".thumbs-rating, .answer-meta").forEach((el) => el.remove());
    return (tmp.innerText || "").trim();
}

function isAutoTranslateEnabled() {
    return localStorage.getItem(AUTO_TRANSLATE_KEY) === "1";
}

function setAutoTranslateEnabled(value) {
    localStorage.setItem(AUTO_TRANSLATE_KEY, value ? "1" : "0");
}

function getTranslateSourceLang() {
    return (localStorage.getItem(TRANSLATE_SOURCE_KEY) || "auto").trim() || "auto";
}

function setTranslateSourceLang(value) {
    const clean = (value || "auto").trim().toLowerCase() || "auto";
    localStorage.setItem(TRANSLATE_SOURCE_KEY, clean);
}

function getTranslateTargetLang() {
    return (localStorage.getItem(TRANSLATE_TARGET_KEY) || "en").trim() || "en";
}

function setTranslateTargetLang(value) {
    const clean = (value || "en").trim().toLowerCase() || "en";
    localStorage.setItem(TRANSLATE_TARGET_KEY, clean);
}

function shouldAutoTranslateSpecialty(specialty) {
    if (!isAutoTranslateEnabled()) return false;
    return String(specialty || "").trim().toLowerCase() === "language";
}

async function appendAutoTranslation(wrapper, sourceText, specialty) {
    if (!wrapper || !shouldAutoTranslateSpecialty(specialty)) return;
    const text = String(sourceText || "").trim();
    if (!text) return;
    const requester = getActingAs();
    const sourceLang = getTranslateSourceLang();
    const targetLang = getTranslateTargetLang();
    if (!targetLang) return;
    try {
        const res = await fetch("/translate/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requester,
                text,
                source_lang: sourceLang,
                target_lang: targetLang,
                provider: "khaya_fallback"
            })
        });
        const data = await res.json();
        if (data.error || !data.translated_text) return;
        const contentEl = wrapper.querySelector(".message-content");
        if (!contentEl) return;
        const block = document.createElement("div");
        block.className = "message-translation";
        const fromTag = escapeHtml(data.source_lang || sourceLang || "auto");
        const toTag = escapeHtml(data.target_lang || targetLang);
        block.innerHTML = `
            <div class="message-translation-head">Translation (${fromTag} -> ${toTag})</div>
            <div class="message-translation-body">${escapeHtml(String(data.translated_text || "")).replace(/\n/g, "<br>")}</div>
        `;
        contentEl.appendChild(block);
    } catch (_) {}
}

function appendMessage(role, label, content, isTrustedHtml = false) {
    const output = document.getElementById("chat-output");
    if (!output) return;
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role} entering`;
    const bodyHtml = isTrustedHtml ? content : escapeHtml(content).replace(/\n/g, "<br>");
    const toolsHtml = role === "ai"
        ? `<div class="message-tools"><button class="speak-btn" type="button">Speak</button><button class="copy-btn" type="button">Copy</button></div>`
        : "";
    wrapper.innerHTML = `
        <div class="message-label">${escapeHtml(label)}</div>
        <div class="message-content">${bodyHtml}</div>
        ${toolsHtml}
    `;
    output.appendChild(wrapper);
    requestAnimationFrame(() => wrapper.classList.remove("entering"));
    output.scrollTop = output.scrollHeight;
    chatLog.push({
        role,
        label,
        content_text: wrapper.querySelector(".message-content")?.innerText || "",
        content_html: isTrustedHtml ? content : null,
        ts: new Date().toISOString()
    });

    if (role === "ai" && isTtsEnabled()) {
        speakText(wrapper.querySelector(".message-content")?.innerText || "");
    }
    return wrapper;
}

function isTtsEnabled() {
    return localStorage.getItem(TTS_KEY) === "1";
}

function setTtsEnabled(value) {
    localStorage.setItem(TTS_KEY, value ? "1" : "0");
    const btn = document.getElementById("tts-toggle-btn");
    if (btn) btn.textContent = value ? "Voice On" : "Voice Off";
}

function detectSpeechLang(text) {
    const sample = String(text || "");
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(sample)) return "ja-JP";
    if (/[\uac00-\ud7af]/.test(sample)) return "ko-KR";
    if (/[\u0600-\u06ff]/.test(sample)) return "ar-SA";
    if (/[\u0400-\u04ff]/.test(sample)) return "ru-RU";
    if (/[\u4e00-\u9fff]/.test(sample)) return "zh-CN";
    return "en-US";
}

function pickVoiceForLang(langTag) {
    if (!("speechSynthesis" in window)) return null;
    const target = String(langTag || "").toLowerCase();
    if (!target) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    let voice = voices.find((v) => String(v.lang || "").toLowerCase() === target);
    if (!voice) {
        const base = target.split("-")[0];
        voice = voices.find((v) => String(v.lang || "").toLowerCase().startsWith(base));
    }
    return voice || null;
}

function speakText(text, options = {}) {
    if (!("speechSynthesis" in window)) return;
    const clean = (text || "").trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean.slice(0, 1500));
    const targetLang = options.lang || detectSpeechLang(clean);
    utter.lang = targetLang;
    const voice = pickVoiceForLang(targetLang);
    if (voice) utter.voice = voice;
    utter.rate = Number(options.rate || 1);
    utter.pitch = Number(options.pitch || 1);
    if (typeof options.volume === "number") utter.volume = options.volume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

function downloadBlob(filename, text, contentType) {
    const blob = new Blob([text], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportChatAsText() {
    const lines = chatLog.map((m) => `[${m.ts}] ${m.label}: ${m.content_text}`);
    downloadBlob(`lumiere-chat-${Date.now()}.txt`, lines.join("\n\n"), "text/plain;charset=utf-8");
}

function exportChatAsJson() {
    downloadBlob(`lumiere-chat-${Date.now()}.json`, JSON.stringify(chatLog, null, 2), "application/json;charset=utf-8");
}

function hydrateChatFromHistory(messages) {
    const output = document.getElementById("chat-output");
    if (!output) return;
    output.innerHTML = "";
    chatLog.length = 0;
    const rows = Array.isArray(messages) ? messages : [];
    rows.forEach((m) => {
        const label = String(m.label || "Lumiere");
        const role = label.toLowerCase().includes("you") ? "user" : "ai";
        appendMessage(role, label, String(m.content_text || ""), false);
    });
}

async function saveCurrentChatToHistory() {
    if (!chatLog.length) {
        toast("No chat messages to save");
        return null;
    }
    const requester = getActingAs();
    const titleInput = document.getElementById("history-title-input");
    const title = (titleInput?.value || "").trim() || `Chat ${new Date().toLocaleString()}`;
    const payload = {
        requester,
        title,
        messages: chatLog.map((m) => ({
            ts: m.ts,
            label: m.label,
            content_text: m.content_text
        }))
    };
    try {
        const res = await fetch("/history/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "ok") {
            toast("Chat saved to history");
            refreshHistoryList();
            return data.id;
        }
        toast(data.error || "Failed to save history");
    } catch (_) {
        toast("Failed to save history");
    }
    return null;
}

function renderHistoryList(sessions, filterQuery = "") {
    const listEl = document.getElementById("history-list");
    if (!listEl) return;
    const q = String(filterQuery || "").trim().toLowerCase();
    const filtered = !q
        ? sessions
        : sessions.filter((s) => {
            const title = String(s.title || "").toLowerCase();
            const id = String(s.id || "").toLowerCase();
            return title.includes(q) || id.includes(q);
        });
    if (!filtered.length) {
        listEl.innerHTML = `<div class="agent-memory-empty">${q ? "No sessions matched your search." : "No saved chats yet."}</div>`;
        return;
    }
    listEl.innerHTML = filtered.map((s) => `
        <div class="history-item">
            <div class="history-main">
                <strong>${escapeHtml(s.title || "Untitled chat")}</strong>
                <span>${escapeHtml(String(s.message_count || 0))} msgs</span>
            </div>
            <div class="history-sub">Updated: ${escapeHtml(String(s.updated_at || "-"))}</div>
            <div class="history-actions">
                <button type="button" class="history-open-btn" data-id="${escapeHtml(s.id)}">Open</button>
                <button type="button" class="history-delete-btn" data-id="${escapeHtml(s.id)}">Delete</button>
            </div>
        </div>
    `).join("");
}

async function refreshHistoryList() {
    const listEl = document.getElementById("history-list");
    if (!listEl) return;
    try {
        const requester = getActingAs();
        const res = await fetch(`/history/sessions?requester=${encodeURIComponent(requester)}&limit=80`);
        const data = await res.json();
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        historySessionsCache = sessions;
        const searchEl = document.getElementById("history-search-input");
        renderHistoryList(sessions, searchEl?.value || "");
    } catch (_) {
        listEl.innerHTML = `<div class="agent-memory-empty">Failed to load history.</div>`;
    }
}

function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function renderUploadedContext(items) {
    const el = document.getElementById("uploaded-context-list");
    if (!el) return;
    if (!items.length) {
        el.innerHTML = "";
        return;
    }
    el.innerHTML = items.map((it) => `
        <div class="upload-chip" title="${escapeHtml(it.summary || "")}">
            <span>${escapeHtml(it.name || "file")}</span>
            <small>${escapeHtml(formatFileSize(it.size))}</small>
        </div>
    `).join("");
}

async function refreshUploadedContext() {
    try {
        const res = await fetch("/uploaded-context");
        const items = await res.json();
        renderUploadedContext(Array.isArray(items) ? items : []);
    } catch (_) {}
}

async function uploadContextFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/upload-context", {
        method: "POST",
        body: fd
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast(`Uploaded: ${file.name}`);
        refreshUploadedContext();
    } else {
        toast(data.error || "Upload failed");
    }
}

async function uploadFilesBatch(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    for (const f of list) {
        await uploadContextFile(f);
    }
}

function shouldSuggestRecovery(content) {
    const text = String(content || "").toLowerCase();
    return (
        !text.trim() ||
        text.includes("error:") ||
        text.includes("request failed") ||
        text.includes("unavailable") ||
        text.includes("couldn't fetch") ||
        text.includes("no available") ||
        text.includes("failed")
    );
}

function reportRequestError(message, kind = "request") {
    const text = `${kind.toUpperCase()}: ${message || "Request failed"}`;
    setErrorRibbon(text);
}

function clearRequestError() {
    setErrorRibbon("");
}

function recoveryActionsHtml() {
    return `
        <div class="recovery-actions">
            <button class="recovery-btn" data-action="retry" type="button">Retry</button>
            <button class="recovery-btn" data-action="simplify" type="button">Simplify</button>
            <button class="recovery-btn" data-action="edit" type="button">Edit</button>
        </div>
    `;
}

function markFailure(question, mode) {
    lastFailedRequest = { question, mode };
}

async function retryLastFailed(modeOverride = null, simplified = false) {
    if (!lastFailedRequest?.question) return;
    const mode = modeOverride || lastFailedRequest.mode || "ask";
    const q = lastFailedRequest.question;
    if (simplified) {
        if (mode === "web") return askLiveWeb(`Give a concise, simpler answer with clear bullet points: ${q}`);
        if (mode === "debate") return askDebate(`Debate this simply with concise points: ${q}`);
        return ask(`Give a concise, simpler answer with clear bullet points: ${q}`);
    }
    if (mode === "web") return askLiveWeb(q);
    if (mode === "debate") return askDebate(q);
    return ask(q);
}

function isConfusionFollowup(text) {
    const t = String(text || "").toLowerCase().trim();
    if (!t) return false;
    const confusionPhrases = [
        "i don't get it",
        "i dont get it",
        "still don't understand",
        "still dont understand",
        "not clear",
        "confusing",
        "i am confused",
        "can you explain better",
        "explain simpler",
        "didn't get",
        "didnt get"
    ];
    return confusionPhrases.some((p) => t.includes(p));
}

function resolveVideoTopicSeed(inputText) {
    const raw = String(inputText || "").trim();
    if (!raw) return currentAgentSpecialty || "personal";
    if (isConfusionFollowup(raw)) {
        const fallback = String(lastAskedQuestion || "").trim();
        if (fallback && !isConfusionFollowup(fallback)) return fallback;
        return currentAgentSpecialty || "personal";
    }
    return raw;
}

function renderMetaverseVideoHero(video) {
    const heroEl = document.getElementById("metaverse-video-hero");
    if (!heroEl) return;
    if (!video) {
        heroEl.innerHTML = `<div class="agent-memory-empty">Select a video to preview it here.</div>`;
        return;
    }
    heroEl.innerHTML = `
        <div class="metaverse-video-frame-wrap">
            <iframe class="metaverse-video-frame" src="${escapeHtml(video.embed_url || "")}" title="${escapeHtml(video.title || "Video")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>
        <div class="metaverse-video-meta">
            <strong>${escapeHtml(video.title || "Video")}</strong>
            <span>${escapeHtml(video.provider || "Video")} · ${escapeHtml(video.duration || "-")} · ${escapeHtml(video.difficulty || "all levels")}</span>
            <p>${escapeHtml(video.description || "")}</p>
        </div>
    `;
}

function renderMetaverseVideoList() {
    const listEl = document.getElementById("metaverse-video-list");
    if (!listEl) return;
    if (!metaverseVideos.length) {
        listEl.innerHTML = `<div class="agent-memory-empty">No videos matched this topic yet.</div>`;
        return;
    }
    listEl.innerHTML = metaverseVideos.map((video) => `
        <article class="metaverse-video-card ${selectedMetaverseVideo?.id === video.id ? "selected" : ""}">
            <div class="metaverse-video-head">
                <strong>${escapeHtml(video.title || "Video")}</strong>
                <span>${escapeHtml(video.duration || "-")}</span>
            </div>
            <div class="metaverse-video-tags">${escapeHtml((video.tags || []).slice(0, 4).join(" · "))}</div>
            <div class="metaverse-video-actions">
                <button type="button" class="meta-zone-btn" data-video-action="preview" data-video-id="${escapeHtml(video.id)}">Preview</button>
                <button type="button" class="meta-zone-btn alt" data-video-action="select" data-video-id="${escapeHtml(video.id)}">Use Context</button>
            </div>
        </article>
    `).join("");
}

async function refreshMetaverseVideos(topicSeed = "", autoRouted = false) {
    const inputEl = document.getElementById("metaverse-video-topic-input");
    const topic = resolveVideoTopicSeed(topicSeed || inputEl?.value || "");
    if (inputEl && topic) inputEl.value = topic;
    try {
        const res = await fetch("/metaverse/videos?q=" + encodeURIComponent(topic) + "&specialty=" + encodeURIComponent(currentAgentSpecialty) + "&limit=8");
        const data = await res.json();
        metaverseVideos = Array.isArray(data.videos) ? data.videos : [];
        if (!selectedMetaverseVideo || !metaverseVideos.some((v) => v.id === selectedMetaverseVideo.id)) {
            selectedMetaverseVideo = metaverseVideos[0] || null;
        }
        renderMetaverseVideoHero(selectedMetaverseVideo);
        renderMetaverseVideoList();
        if (autoRouted) {
            toast(`Metaverse Video Portal opened for: ${topic}`);
        }
    } catch (_) {}
}

async function autoRouteToMetaverseVideoPortal(triggerText) {
    const topic = resolveVideoTopicSeed(triggerText);
    applyView("metaverse");
    await refreshMetaverseVideos(topic, true);
    appendMessage(
        "ai",
        "Lumiere",
        `I routed this to the Metaverse Video Portal for "${topic}". Pick a video, then use "Ask With Video" for a guided follow-up.`,
        false
    );
}

function handleMetaverseZoneAction(action, specialty, name) {
    const safeSpecialty = (specialty || "personal").trim() || "personal";
    const safeName = (name || safeSpecialty).trim() || safeSpecialty;
    if (action === "train") {
        chainAction("train", safeSpecialty);
        return;
    }
    (async () => {
        try {
            const requester = getActingAs();
            await fetch("/metaverse/travel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requester, zone: safeSpecialty, status: "online" })
            });
            await refreshMetaverseState();
        } catch (_) {}
        applyView("chat");
        lastAskedQuestion = `Need help with ${safeSpecialty}`;
        const prompt = `Metaverse port sync: connect me with ${safeName} (${safeSpecialty}) and give a concise action plan for this specialty.`;
        ask(prompt);
    })();
}

function buildConversationContext(limit = 6) {
    const rows = chatLog.slice(-Math.max(1, limit));
    const lines = rows
        .filter((m) => m && m.content_text)
        .map((m) => `${m.label || (m.role === "user" ? "You" : "Lumiere")}: ${String(m.content_text).trim()}`)
        .filter(Boolean);
    const text = lines.join("\n").slice(0, 2000);
    return text;
}

async function ask(promptText) {
    if (!requireLoginIfNeeded()) return;
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    clearRequestError();
    growAvatarByInteraction();
    lastAskedQuestion = q;
    if (input && !promptText) input.value = "";
    setBusy(true);

    try {
        const requester = getActingAs();
        const ctx = buildConversationContext(8);
        const res = await fetch("/ask?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester) + "&ctx=" + encodeURIComponent(ctx));
        const txt = await res.text();
        const meta = parseAgentMetaFromHtml(txt);
        const responseSpecialty = meta?.specialty || currentAgentSpecialty;
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        const rawAnswerText = parseAnswerTextForTranslation(txt);
        let aiWrapper = null;
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "ask");
            reportRequestError("Model output looked unstable", "ask");
            aiWrapper = appendMessage("ai", "Lumiere", txt + recoveryActionsHtml(), true);
        } else {
            aiWrapper = appendMessage("ai", "Lumiere", txt, true);
        }
        await appendAutoTranslation(aiWrapper, rawAnswerText, responseSpecialty);
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact(),
            refreshReminders(),
            refreshUsageLog()
        ]);
    } catch (err) {
        markFailure(q, "ask");
        reportRequestError(err.message || "Request failed", "ask");
        appendMessage("ai", "System", `Error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.focus();
        }
    }
}

async function askDebate(promptText) {
    if (!requireLoginIfNeeded()) return;
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    clearRequestError();
    growAvatarByInteraction();
    lastAskedQuestion = q;
    if (input && !promptText) input.value = "";
    setBusy(true);

    try {
        const requester = getActingAs();
        const ctx = buildConversationContext(8);
        const res = await fetch("/debate?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester) + "&ctx=" + encodeURIComponent(ctx));
        const txt = await res.text();
        const meta = parseAgentMetaFromHtml(txt);
        const responseSpecialty = meta?.specialty || currentAgentSpecialty;
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        const rawAnswerText = parseAnswerTextForTranslation(txt);
        let aiWrapper = null;
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "debate");
            reportRequestError("Debate output looked unstable", "debate");
            aiWrapper = appendMessage("ai", "Lumiere Debate", txt + recoveryActionsHtml(), true);
        } else {
            aiWrapper = appendMessage("ai", "Lumiere Debate", txt, true);
        }
        await appendAutoTranslation(aiWrapper, rawAnswerText, responseSpecialty);
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact(),
            refreshReminders(),
            refreshUsageLog()
        ]);
    } catch (err) {
        markFailure(q, "debate");
        reportRequestError(err.message || "Request failed", "debate");
        appendMessage("ai", "System", `Debate error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.focus();
        }
    }
}

async function askLiveWeb(promptText) {
    if (!requireLoginIfNeeded()) return;
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    clearRequestError();
    growAvatarByInteraction();
    lastAskedQuestion = q;
    if (input && !promptText) input.value = "";
    setBusy(true);

    try {
        const requester = getActingAs();
        const ctx = buildConversationContext(8);
        const res = await fetch("/ask-live?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester) + "&ctx=" + encodeURIComponent(ctx));
        const txt = await res.text();
        const meta = parseAgentMetaFromHtml(txt);
        const responseSpecialty = meta?.specialty || currentAgentSpecialty;
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        const rawAnswerText = parseAnswerTextForTranslation(txt);
        let aiWrapper = null;
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "web");
            reportRequestError("Live web output looked unstable", "web");
            aiWrapper = appendMessage("ai", "Lumiere Live Web", txt + recoveryActionsHtml(), true);
        } else {
            aiWrapper = appendMessage("ai", "Lumiere Live Web", txt, true);
        }
        await appendAutoTranslation(aiWrapper, rawAnswerText, responseSpecialty);
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact(),
            refreshReminders(),
            refreshUsageLog()
        ]);
    } catch (err) {
        markFailure(q, "web");
        reportRequestError(err.message || "Request failed", "web");
        appendMessage("ai", "System", `Live web error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.focus();
        }
    }
}

function levelBadgeClass(level) {
    if (level >= 5) return "badge-gold";
    if (level >= 3) return "badge-silver";
    return "badge-bronze";
}

function fmtMaybe(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
}

async function refreshAgentStats() {
    const container = document.querySelector(".agent-stats");
    if (!container) return;
    try {
        const requester = getActingAs();
        const res = await fetch("/agent-stats?requester=" + encodeURIComponent(requester));
        const agents = await res.json();
        metaverseAgents = Array.isArray(agents) ? agents : [];
        container.innerHTML = "";
        metaverseAgents.forEach((agent) => {
            const accuracy = Math.max(0, Math.min(100, Number(agent.accuracy || 0)));
            const level = Number(agent.level || 1);
            const category = (agent.category || "personal").toString();
            const card = document.createElement("div");
            card.className = "agent-stat";
            card.innerHTML = `
                <div class="agent-head">
                    <div class="agent-name">${escapeHtml(agent.name)}</div>
                    <div class="agent-level ${levelBadgeClass(level)}">Lvl ${level}</div>
                </div>
                <div class="agent-bar"><span style="width:${accuracy.toFixed(1)}%"></span></div>
                <div class="agent-foot">${escapeHtml(agent.specialty)} · ${accuracy.toFixed(1)}% mastery</div>
                <div class="agent-category">Category: ${escapeHtml(category)}</div>
            `;
            container.appendChild(card);
        });
        renderAgentComparison();
        renderMetaverseScene();
        renderMetaverseAgentPorts();
        renderAvatarStudioCard();
    } catch (_) {}
}

function clamp01(v) {
    return Math.max(0, Math.min(1, Number(v || 0)));
}

function compareKey(agent) {
    return String(agent?.specialty || "personal").trim().toLowerCase();
}

function colorFromText(text) {
    let h = 0;
    const raw = String(text || "agent");
    for (let i = 0; i < raw.length; i += 1) h = ((h << 5) - h) + raw.charCodeAt(i);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 76% 56%)`;
}

function initialsFromName(name) {
    const parts = String(name || "A").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "A";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function compareAgentHeroCard(agent, side = "a") {
    const name = String(agent?.name || compareKey(agent) || "Agent");
    const spec = String(agent?.specialty || "personal");
    const level = Number(agent?.level || 1);
    const acc = Math.max(0, Math.min(100, Number(agent?.accuracy || 0)));
    const tone = colorFromText(spec);
    return `
        <article class="compare-hero-card ${side}" style="--hero-tone:${escapeHtml(tone)}">
            <div class="compare-avatar-3d">${escapeHtml(initialsFromName(name))}</div>
            <div class="compare-hero-main">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(spec)} · Lvl ${level}</span>
            </div>
            <div class="compare-hero-score">${acc.toFixed(1)}%</div>
        </article>
    `;
}

function ensureCompareSelectOptions() {
    const aSel = document.getElementById("compare-agent-a");
    const bSel = document.getElementById("compare-agent-b");
    if (!aSel || !bSel) return;
    const options = metaverseAgents.slice(0, 20).map((agent) => {
        const key = compareKey(agent);
        return `<option value="${escapeHtml(key)}">${escapeHtml(agent.name || key)}</option>`;
    }).join("");
    if (!options) {
        aSel.innerHTML = "";
        bSel.innerHTML = "";
        return;
    }
    const prevA = aSel.value;
    const prevB = bSel.value;
    aSel.innerHTML = options;
    bSel.innerHTML = options;
    aSel.value = Array.from(aSel.options).some((o) => o.value === prevA) ? prevA : aSel.options[0].value;
    if (Array.from(bSel.options).some((o) => o.value === prevB)) {
        bSel.value = prevB;
    } else {
        bSel.value = bSel.options[Math.min(1, bSel.options.length - 1)].value;
    }
    if (aSel.value === bSel.value && bSel.options.length > 1) {
        bSel.value = bSel.options[1].value;
    }
}

function compareAgentByKey(key) {
    const normalized = String(key || "").trim().toLowerCase();
    return metaverseAgents.find((agent) => compareKey(agent) === normalized) || null;
}

function compareMetricsFor(agent) {
    const key = compareKey(agent);
    const usage = usageRowsBySpecialty[key] || {};
    const up = Number(usage.ratings_up || 0);
    const down = Number(usage.ratings_down || 0);
    const messages = Number(usage.messages || agent.interactions || 0);
    const level = Math.max(1, Number(agent.level || 1));
    const accuracy = Math.max(0, Math.min(100, Number(agent.accuracy || 0)));
    const consistency = up + down > 0 ? (up / (up + down)) * 100 : Math.max(35, accuracy * 0.72);
    const responsePower = Math.max(25, Math.min(100, 40 + level * 9));
    return [
        { label: "Mastery", value: accuracy },
        { label: "Level", value: clamp01(level / 10) * 100 },
        { label: "Usage", value: clamp01(messages / 80) * 100 },
        { label: "Upvotes", value: clamp01(up / 40) * 100 },
        { label: "Consistency", value: Math.max(0, Math.min(100, consistency)) },
        { label: "Response", value: responsePower },
    ];
}

function compareInsight(metricLabel, aVal, bVal, aName, bName) {
    const diff = Math.abs(aVal - bVal).toFixed(1);
    if (aVal === bVal) return `${metricLabel}: both agents are equal here.`;
    const better = aVal > bVal ? aName : bName;
    const lower = aVal > bVal ? bName : aName;
    const nuance = metricLabel === "Consistency"
        ? "More stable answers across ratings."
        : metricLabel === "Response"
            ? "Faster and clearer response behavior."
            : metricLabel === "Upvotes"
                ? "Gets better user feedback."
                : metricLabel === "Usage"
                    ? "Used more often in sessions."
                    : metricLabel === "Mastery"
                        ? "Shows stronger problem quality."
                        : "Shows stronger progression.";
    return `${metricLabel}: ${better} leads ${lower} by ${diff} points. ${nuance}`;
}

function buildRadarPolygon(metrics, cx, cy, radius) {
    const points = [];
    const axis = metrics.length;
    for (let i = 0; i < axis; i += 1) {
        const angle = (-Math.PI / 2) + (Math.PI * 2 * i / axis);
        const r = radius * clamp01(metrics[i].value / 100);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(" ");
}

function renderCompareRadar(agentA, agentB) {
    const svg = document.getElementById("compare-radar");
    const legend = document.getElementById("compare-legend");
    const hero = document.getElementById("compare-hero");
    const insight = document.getElementById("compare-insight");
    if (!svg || !legend || !agentA || !agentB) return;
    const metricsA = compareMetricsFor(agentA);
    const metricsB = compareMetricsFor(agentB);
    const labels = metricsA.map((m) => m.label);
    const cx = 260;
    const cy = 205;
    const radius = 145;
    const rings = [0.25, 0.5, 0.75, 1.0].map((r) => {
        const rr = radius * r;
        return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="rgba(173,196,226,0.15)" />`;
    }).join("");
    const axisLines = labels.map((label, i) => {
        const angle = (-Math.PI / 2) + (Math.PI * 2 * i / labels.length);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const lx = cx + Math.cos(angle) * (radius + 26);
        const ly = cy + Math.sin(angle) * (radius + 26);
        const av = Number(metricsA[i].value || 0);
        const bv = Number(metricsB[i].value || 0);
        const info = compareInsight(label, av, bv, agentA.name || "Agent A", agentB.name || "Agent B");
        return `
            <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(160,186,219,0.18)" />
            <text x="${lx}" y="${ly}" class="radar-label" data-insight="${escapeHtml(info)}">${escapeHtml(label)} ${av.toFixed(0)}/${bv.toFixed(0)}</text>
            <circle cx="${lx}" cy="${ly}" r="16" fill="rgba(0,0,0,0.001)" class="radar-hit" data-insight="${escapeHtml(info)}"></circle>
        `;
    }).join("");
    const polyA = buildRadarPolygon(metricsA, cx, cy, radius);
    const polyB = buildRadarPolygon(metricsB, cx, cy, radius);
    svg.innerHTML = `
        <g>
            ${rings}
            ${axisLines}
            <polygon points="${polyA}" fill="rgba(59,130,246,0.24)" stroke="#3b82f6" stroke-width="2.5"></polygon>
            <polygon points="${polyB}" fill="rgba(236,72,153,0.22)" stroke="#ec4899" stroke-width="2.5"></polygon>
            <circle cx="${cx}" cy="${cy}" r="3" fill="#b8d8ff"></circle>
        </g>
    `;
    legend.innerHTML = `
        <div class="compare-legend-item"><span class="dot a"></span>${escapeHtml(agentA.name || compareKey(agentA))}</div>
        <div class="compare-legend-item"><span class="dot b"></span>${escapeHtml(agentB.name || compareKey(agentB))}</div>
    `;
    if (hero) {
        hero.innerHTML = `
            ${compareAgentHeroCard(agentA, "a")}
            ${compareAgentHeroCard(agentB, "b")}
        `;
    }
    if (insight) {
        insight.textContent = "Hover a radar label to see deeper agent analysis.";
    }
    const inlineTip = document.getElementById("compare-inline-tip");
    const hideInlineTip = () => {
        if (!inlineTip) return;
        inlineTip.classList.remove("show");
        inlineTip.textContent = "";
    };
    svg.querySelectorAll(".radar-hit, .radar-label[data-insight]").forEach((node) => {
        node.addEventListener("mouseenter", (ev) => {
            const msg = node.getAttribute("data-insight") || "";
            if (insight) insight.textContent = node.getAttribute("data-insight") || "";
            if (inlineTip) {
                inlineTip.textContent = msg;
                inlineTip.classList.add("show");
                inlineTip.style.left = `${Math.min(window.innerWidth - 280, Math.max(12, ev.clientX + 14))}px`;
                inlineTip.style.top = `${Math.min(window.innerHeight - 120, Math.max(12, ev.clientY + 12))}px`;
            }
        });
        node.addEventListener("mousemove", (ev) => {
            if (!inlineTip || !inlineTip.classList.contains("show")) return;
            inlineTip.style.left = `${Math.min(window.innerWidth - 280, Math.max(12, ev.clientX + 14))}px`;
            inlineTip.style.top = `${Math.min(window.innerHeight - 120, Math.max(12, ev.clientY + 12))}px`;
        });
        node.addEventListener("mouseleave", () => {
            if (insight) insight.textContent = "Hover a radar label to see deeper agent analysis.";
            hideInlineTip();
        });
    });
}

function renderCompareTable() {
    const el = document.getElementById("agent-compare-list");
    const hero = document.getElementById("compare-hero");
    const insight = document.getElementById("compare-insight");
    if (!el) return;
    if (!metaverseAgents.length) {
        el.innerHTML = `<div class="agent-memory-empty">No agent data yet.</div>`;
        return;
    }
    const rows = metaverseAgents
        .slice()
        .sort((a, b) => Number(b.accuracy || 0) - Number(a.accuracy || 0))
        .map((agent) => {
            const usage = usageRowsBySpecialty[compareKey(agent)] || {};
            const tone = colorFromText(agent.specialty || "personal");
            const mastery = Math.max(0, Math.min(100, Number(agent.accuracy || 0)));
            const usageVal = Number(usage.messages || agent.interactions || 0);
            const usagePct = Math.max(0, Math.min(100, (usageVal / 90) * 100));
            return `
                <div class="compare-row">
                    <div class="compare-agent-cell"><span class="compare-mini-avatar" style="--hero-tone:${escapeHtml(tone)}">${escapeHtml(initialsFromName(agent.name || agent.specialty || "A"))}</span><strong>${escapeHtml(agent.name || agent.specialty || "Agent")}</strong><span>${escapeHtml(agent.specialty || "personal")}</span></div>
                    <div>Lvl ${escapeHtml(String(agent.level || 1))}</div>
                    <div class="compare-metric"><span>${mastery.toFixed(1)}%</span><em style="width:${mastery.toFixed(1)}%"></em></div>
                    <div class="compare-metric"><span>${escapeHtml(String(usageVal))}</span><em style="width:${usagePct.toFixed(1)}%"></em></div>
                </div>
            `;
        });
    el.innerHTML = `
        <div class="compare-head compare-row">
            <div>Agent</div>
            <div>Level</div>
            <div>Mastery</div>
            <div>Usage</div>
        </div>
        ${rows.join("")}
    `;
    if (hero) hero.innerHTML = "";
    if (insight) insight.textContent = "Table mode shows numeric score bars for quick comparison.";
}

function setCompareMode(mode) {
    compareMode = mode === "table" ? "table" : "radar";
    const radarWrap = document.getElementById("compare-radar-wrap");
    const tableWrap = document.getElementById("agent-compare-list");
    const inlineTip = document.getElementById("compare-inline-tip");
    document.querySelectorAll(".compare-toggle-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === compareMode);
    });
    if (radarWrap) radarWrap.style.display = compareMode === "radar" ? "block" : "none";
    if (tableWrap) tableWrap.style.display = compareMode === "table" ? "grid" : "none";
    if (inlineTip) {
        inlineTip.classList.remove("show");
        inlineTip.textContent = "";
    }
}

function renderAgentComparison() {
    ensureCompareSelectOptions();
    const aSel = document.getElementById("compare-agent-a");
    const bSel = document.getElementById("compare-agent-b");
    const insight = document.getElementById("compare-insight");
    const agentA = compareAgentByKey(aSel?.value || "");
    const agentB = compareAgentByKey(bSel?.value || "");
    if (compareMode === "table") renderCompareTable();
    if (agentA && agentB) {
        renderCompareRadar(agentA, agentB);
    } else {
        const svg = document.getElementById("compare-radar");
        if (svg) svg.innerHTML = "";
        const legend = document.getElementById("compare-legend");
        if (legend) legend.innerHTML = `<div class="agent-memory-empty">Pick two agents to compare.</div>`;
        if (insight) insight.textContent = "Pick two agents to compare.";
    }
}

async function chainAction(action, specialty) {
    if (!requireLoginIfNeeded()) return;
    try {
        let endpoint = "";
        let payload = { specialty };
        const defaultUser = getActingAs();

        if (action === "mint") {
            endpoint = "/chain/mint-agent";
            const owner = window.prompt("Owner name", defaultUser) || defaultUser;
            payload.owner = owner;
        } else if (action === "list") {
            endpoint = "/chain/list-agent";
            const seller = window.prompt("Seller name", defaultUser) || defaultUser;
            const price = window.prompt("List price in SOL", "0.25");
            payload.seller = seller;
            payload.price_sol = price;
        } else if (action === "buy") {
            endpoint = "/chain/buy-agent";
            const buyer = window.prompt("Buyer name", defaultUser);
            if (!buyer) return;
            payload.buyer = buyer;
        } else if (action === "rent") {
            endpoint = "/chain/rent-agent";
            const renter = window.prompt("Renter name", defaultUser);
            if (!renter) return;
            const hours = window.prompt("Rental hours", "4");
            payload.renter = renter;
            payload.hours = hours;
        } else if (action === "train") {
            endpoint = "/chain/train-agent";
            payload.signal = 1;
            payload.requester = defaultUser;
        } else {
            return;
        }

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "ok") {
            toast(`Chain ${action} success`);
            refreshAgentStats();
            refreshMarketplace();
            refreshUsageLog();
        } else {
            toast(data.error || `Chain ${action} failed`);
        }
    } catch (_) {
        toast(`Chain ${action} failed`);
    }
}

async function refreshMarketplace() {
    const listEl = document.getElementById("marketplace-list");
    const eventsEl = document.getElementById("marketplace-events");
    const manageEl = document.getElementById("marketplace-manage-list");
    if (!listEl || !eventsEl || !manageEl) return;
    try {
        const requester = getActingAs();
        const res = await fetch("/chain/marketplace?requester=" + encodeURIComponent(requester));
        const data = await res.json();
        const statsRes = await fetch("/agent-stats?requester=" + encodeURIComponent(requester));
        const myAgents = await statsRes.json();
        const listed = data.listed || [];
        const events = data.recent_events || [];

        if (!listed.length) {
            listEl.innerHTML = `<div class="agent-memory-empty">No listed agents right now.</div>`;
        } else {
            listEl.innerHTML = listed.map((item) => `
                <div class="market-item premium">
                    <div class="market-main">
                        <strong>${escapeHtml(item.agent_name || item.specialty)}</strong>
                        <span class="market-price">${escapeHtml(String(item.price_sol || "-"))} SOL</span>
                    </div>
                    <div class="market-sub"><span class="market-tag">${escapeHtml(item.specialty)}</span> Owner: ${escapeHtml(item.owner || "-")} · Mint: ${escapeHtml((item.mint_address || "").slice(0, 8))}...</div>
                    <div class="chain-actions">
                        <button class="chain-action" data-action="buy" data-specialty="${escapeHtml(item.specialty)}">Buy</button>
                        <button class="chain-action" data-action="rent" data-specialty="${escapeHtml(item.specialty)}">Rent</button>
                    </div>
                </div>
            `).join("");
        }

        if (!Array.isArray(myAgents) || !myAgents.length) {
            manageEl.innerHTML = `<div class="agent-memory-empty">No agents available yet.</div>`;
        } else {
            manageEl.innerHTML = myAgents.map((agent) => `
                <div class="market-item owner">
                    <div class="market-main">
                        <strong>${escapeHtml(agent.name || agent.specialty)}</strong>
                        <span class="market-level">Lvl ${escapeHtml(String(agent.level || 1))}</span>
                    </div>
                    <div class="market-sub"><span class="market-tag">${escapeHtml(agent.specialty)}</span> Manage token actions for this agent</div>
                    <div class="chain-actions">
                        <button class="chain-action" data-action="mint" data-specialty="${escapeHtml(agent.specialty)}">Mint</button>
                        <button class="chain-action" data-action="list" data-specialty="${escapeHtml(agent.specialty)}">List</button>
                        <button class="chain-action" data-action="rent" data-specialty="${escapeHtml(agent.specialty)}">Rent</button>
                        <button class="chain-action" data-action="train" data-specialty="${escapeHtml(agent.specialty)}">Train</button>
                    </div>
                </div>
            `).join("");
        }

        if (!events.length) {
            eventsEl.innerHTML = "";
        } else {
            const rendered = events.slice().reverse().map((ev) => {
                const payload = ev.payload || {};
                let summary = `${ev.event}`;
                if (ev.event === "transfer") summary = `transfer ${payload.from || "?"} -> ${payload.to || "?"}`;
                if (ev.event === "list") summary = `list ${payload.seller || "?"} @ ${payload.price_sol || "-"} SOL`;
                if (ev.event === "rent") summary = `rent ${payload.renter || "?"} (${payload.hours || 0}h)`;
                if (ev.event === "mint") summary = `mint ${payload.owner || "?"}`;
                return `<div class="market-event"><span class="market-event-spec">${escapeHtml(ev.specialty || "-")}</span><span>${escapeHtml(summary)}</span></div>`;
            }).join("");
            eventsEl.innerHTML = `
                <div class="market-events-head">Recent Chain Activity</div>
                ${rendered}
            `;
        }
    } catch (_) {}
}

async function refreshUsageLog() {
    const listEl = document.getElementById("usage-log-list");
    if (!listEl) return;
    try {
        const res = await fetch("/usage-log");
        const data = await res.json();
        const rows = data.agents || [];
        usageRowsBySpecialty = {};
        rows.forEach((r) => {
            usageRowsBySpecialty[String(r.specialty || "").trim().toLowerCase()] = r;
        });
        if (!rows.length) {
            listEl.innerHTML = `<div class="agent-memory-empty">No usage yet.</div>`;
            renderAgentComparison();
            return;
        }
        listEl.innerHTML = rows.slice(0, 8).map((r) => `
            <div class="usage-row">
                <span>${escapeHtml(r.specialty)}</span>
                <span>msg ${r.messages}</span>
                <span>👍 ${r.ratings_up}</span>
                <span>👎 ${r.ratings_down}</span>
            </div>
        `).join("");
        renderAgentComparison();
    } catch (_) {}
}

function renderAuthStatus(state) {
    const el = document.getElementById("auth-status");
    if (!el) return;
    if (!state?.authenticated) {
        el.textContent = "Not signed in";
        return;
    }
    const user = state.user || {};
    el.textContent = `Signed in as ${user.username} (${user.role}, tenant=${user.tenant_id})`;
}

async function refreshAuthState() {
    try {
        const res = await fetch("/auth/me");
        const data = await res.json();
        if (data?.authenticated) {
            setAuthUser(data.user || null);
            renderAuthStatus(data);
            const username = String((data.user || {}).username || "").trim();
            if (username) {
                setActingAs(username, { silent: true });
            }
            return data;
        }
        setAuthToken("");
        setAuthUser(null);
        renderAuthStatus({ authenticated: false });
        return { authenticated: false };
    } catch (_) {
        renderAuthStatus({ authenticated: false });
        return { authenticated: false };
    }
}

async function refreshAuthMode() {
    try {
        const res = await fetch("/auth/mode");
        const data = await res.json();
        authModeRequired = !!data?.auth_required;
        const toggle = document.getElementById("auth-required-toggle");
        if (toggle) toggle.checked = authModeRequired;
        setAuthModeDescription(authModeRequired);
        return authModeRequired;
    } catch (_) {
        return false;
    }
}

async function saveAuthMode(enabled) {
    const res = await fetch("/auth/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_required: !!enabled })
    });
    const data = await res.json();
    if (data.status === "ok") {
        authModeRequired = !!data.auth_required;
        setAuthModeDescription(authModeRequired);
        toast(`Auth required ${authModeRequired ? "enabled" : "disabled"}`);
        return;
    }
    const toggle = document.getElementById("auth-required-toggle");
    if (toggle) toggle.checked = authModeRequired;
    toast(data.error || "Failed to change auth mode");
}

function requireLoginIfNeeded() {
    if (!authModeRequired) return true;
    if (getAuthToken()) return true;
    toast("Login required in this mode");
    return false;
}

async function authLogin() {
    const username = (document.getElementById("auth-username")?.value || "").trim();
    const password = (document.getElementById("auth-password")?.value || "").trim();
    if (!username || !password) {
        toast("Username and password required");
        return;
    }
    const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.status === "ok" && data.token) {
        setAuthToken(data.token);
        setAuthUser(data.user || null);
        renderAuthStatus({ authenticated: true, user: data.user || {} });
        setActingAs((data.user || {}).username || username);
        toast("Logged in");
        return;
    }
    toast(data.error || "Login failed");
}

async function authRegister() {
    const username = (document.getElementById("auth-username")?.value || "").trim();
    const password = (document.getElementById("auth-password")?.value || "").trim();
    const tenant = (document.getElementById("auth-tenant")?.value || "default").trim() || "default";
    const role = (document.getElementById("auth-role")?.value || "user").trim();
    if (!username || !password) {
        toast("Username and password required");
        return;
    }
    const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, tenant_id: tenant, role })
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Registered. You can now login.");
        return;
    }
    toast(data.error || "Register failed");
}

async function authLogout() {
    if (!window.confirm("Logout from this session?")) return;
    try {
        await fetch("/auth/logout", { method: "POST" });
    } catch (_) {}
    setAuthToken("");
    setAuthUser(null);
    renderAuthStatus({ authenticated: false });
    toast("Logged out");
}

function renderMemoryScopes(data) {
    const wrap = document.getElementById("memory-scope-list");
    if (!wrap) return;
    const active = new Set((data?.active_scopes || []).map((x) => String(x)));
    const available = Array.isArray(data?.available_scopes) ? data.available_scopes : [];
    wrap.innerHTML = available.map((scope) => `
        <label class="settings-chip">
            <input type="checkbox" class="memory-scope-box" value="${escapeHtml(String(scope))}" ${active.has(String(scope)) ? "checked" : ""}>
            <span>${escapeHtml(String(scope))}</span>
        </label>
    `).join("");
}

function renderMemoryItems(items) {
    const list = document.getElementById("memory-items-list");
    if (!list) return;
    if (!Array.isArray(items) || !items.length) {
        list.innerHTML = `<div class="agent-memory-empty">No memory items yet.</div>`;
        return;
    }
    list.innerHTML = items.slice().reverse().slice(0, 60).map((item) => `
        <div class="settings-list-item">
            <div>${escapeHtml(String(item.text || ""))}</div>
            <div class="meta">scope=${escapeHtml(String(item.scope || "personal"))} · confidence=${escapeHtml(String(item.confidence ?? "-"))}</div>
            <div class="settings-actions">
                <button type="button" class="memory-edit-btn" data-id="${escapeHtml(String(item.id || ""))}">Edit</button>
                <button type="button" class="memory-del-btn" data-id="${escapeHtml(String(item.id || ""))}">Delete</button>
            </div>
        </div>
    `).join("");
}

async function refreshMemoryControls() {
    const requester = getActingAs();
    try {
        const scopesRes = await fetch(`/memory/scopes?requester=${encodeURIComponent(requester)}`);
        const scopesData = await scopesRes.json();
        if (!scopesData.error) renderMemoryScopes(scopesData);
        const itemsRes = await fetch(`/memory/items?requester=${encodeURIComponent(requester)}`);
        const itemsData = await itemsRes.json();
        if (!itemsData.error) renderMemoryItems(itemsData.items || []);
    } catch (_) {}
}

async function saveMemoryScopesFromUi() {
    const requester = getActingAs();
    const boxes = Array.from(document.querySelectorAll(".memory-scope-box:checked"));
    const active_scopes = boxes.map((b) => b.value);
    const res = await fetch("/memory/scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester, active_scopes })
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Memory scopes saved");
        return;
    }
    toast(data.error || "Failed to save scopes");
}

async function addMemoryItemFromUi() {
    const requester = getActingAs();
    const textInput = document.getElementById("memory-new-text");
    const scopeInput = document.getElementById("memory-new-scope");
    const text = (textInput?.value || "").trim();
    const scope = (scopeInput?.value || "personal").trim();
    if (!text) {
        toast("Memory text is required");
        return;
    }
    const res = await fetch("/memory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester, text, scope })
    });
    const data = await res.json();
    if (data.status === "ok") {
        if (textInput) textInput.value = "";
        toast("Memory item added");
        refreshMemoryControls();
        return;
    }
    toast(data.error || "Failed to add memory");
}

async function updateMemoryItemFromUi(memoryId) {
    const requester = getActingAs();
    const nextText = window.prompt("Update memory text");
    if (nextText === null) return;
    const trimmed = String(nextText || "").trim();
    if (!trimmed) {
        toast("Memory text cannot be empty");
        return;
    }
    const res = await fetch(`/memory/items/${encodeURIComponent(memoryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester, text: trimmed })
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Memory updated");
        refreshMemoryControls();
        return;
    }
    toast(data.error || "Failed to update memory");
}

async function deleteMemoryItemFromUi(memoryId) {
    if (!window.confirm("Delete this memory item?")) return;
    const requester = getActingAs();
    const res = await fetch(`/memory/items/${encodeURIComponent(memoryId)}?requester=${encodeURIComponent(requester)}`, {
        method: "DELETE"
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Memory removed");
        refreshMemoryControls();
        return;
    }
    toast(data.error || "Failed to remove memory");
}

function renderEvaluationReport(data) {
    const el = document.getElementById("evaluation-report");
    if (!el) return;
    if (!data || data.error) {
        el.innerHTML = `<div class="agent-memory-empty">${escapeHtml(data?.error || "No evaluation data")}</div>`;
        return;
    }
    const kpis = data.kpis || {};
    const raw = data.raw || {};
    el.innerHTML = `
        <div class="settings-list-item"><div>Task Success: ${escapeHtml(String(kpis.task_success_rate ?? "-"))}</div></div>
        <div class="settings-list-item"><div>Reminder Correctness: ${escapeHtml(String(kpis.reminder_correctness_rate ?? "-"))}</div></div>
        <div class="settings-list-item"><div>Memory Precision: ${escapeHtml(String(kpis.memory_precision_rate ?? "-"))}</div></div>
        <div class="settings-list-item"><div>Hallucination Rate: ${escapeHtml(String(kpis.hallucination_rate ?? "-"))}</div></div>
        <div class="settings-list-item"><div class="meta">Interactions: ${escapeHtml(String(raw.total_interactions ?? 0))}</div></div>
    `;
}

function renderCheckpointList(data) {
    const el = document.getElementById("checkpoint-list");
    if (!el) return;
    const checkpoints = Array.isArray(data?.checkpoints) ? data.checkpoints : [];
    if (!checkpoints.length) {
        el.innerHTML = `<div class="agent-memory-empty">No checkpoints yet.</div>`;
        return;
    }
    const activeId = String(data?.active_checkpoint_id || "");
    el.innerHTML = checkpoints.slice().reverse().map((cp) => `
        <div class="settings-list-item">
            <div>${escapeHtml(String(cp.id || "checkpoint"))}</div>
            <div class="meta">${escapeHtml(String(cp.status || "candidate"))} · ${escapeHtml(String(cp.dataset_path || ""))}</div>
            <div class="settings-actions">
                <button type="button" class="checkpoint-promote-btn" data-id="${escapeHtml(String(cp.id || ""))}" ${String(cp.id) === activeId ? "disabled" : ""}>Promote</button>
            </div>
        </div>
    `).join("");
}

async function refreshEvaluationAndQuality() {
    const requester = getActingAs();
    try {
        const evalRes = await fetch(`/evaluation/report?requester=${encodeURIComponent(requester)}`);
        const evalData = await evalRes.json();
        renderEvaluationReport(evalData);
        const cpRes = await fetch(`/checkpoints/list?requester=${encodeURIComponent(requester)}`);
        const cpData = await cpRes.json();
        renderCheckpointList(cpData);
    } catch (_) {}
}

async function runRegressionFromUi() {
    const requester = getActingAs();
    const res = await fetch(`/quality/regression/run?requester=${encodeURIComponent(requester)}`);
    const data = await res.json();
    if (data?.passed) {
        toast(`Regression passed (${data.summary?.pass_count || 0}/${data.summary?.total || 0})`);
    } else {
        toast("Regression has failing checks");
    }
}

async function createCheckpointFromUi() {
    const requester = getActingAs();
    const notes = (document.getElementById("checkpoint-notes")?.value || "").trim();
    const res = await fetch("/checkpoints/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester, notes })
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Checkpoint created");
        refreshEvaluationAndQuality();
        return;
    }
    toast(data.error || "Checkpoint create failed");
}

async function promoteCheckpointFromUi(checkpointId) {
    const requester = getActingAs();
    const res = await fetch(`/checkpoints/${encodeURIComponent(checkpointId)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester })
    });
    const data = await res.json();
    if (data.status === "ok") {
        toast("Checkpoint promoted");
        refreshEvaluationAndQuality();
        return;
    }
    toast(data.error || "Checkpoint promote failed");
}

function loadAgentAvatarProfiles() {
    try {
        const parsed = JSON.parse(localStorage.getItem(AGENT_AVATAR_PROFILE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveAgentAvatarProfiles(profiles) {
    try {
        localStorage.setItem(AGENT_AVATAR_PROFILE_KEY, JSON.stringify(profiles || {}));
    } catch (_) {}
}

function getAvatarProfile(specialty) {
    const key = String(specialty || "personal").trim().toLowerCase() || "personal";
    const profiles = loadAgentAvatarProfiles();
    return profiles[key] || { shape: "orb", color: "#22d3ee" };
}

function avatarClassName(shape) {
    const s = String(shape || "orb").toLowerCase();
    if (s === "square") return "square";
    if (s === "diamond") return "diamond";
    return "orb";
}

function avatarBadgeHtml(specialty) {
    const profile = getAvatarProfile(specialty);
    const shape = avatarClassName(profile.shape);
    const color = String(profile.color || "#22d3ee");
    return `<span class="meta-agent-avatar ${shape}" style="--agent-avatar-color:${escapeHtml(color)}"></span>`;
}

function renderMetaverseScene() {
    const sceneEl = document.getElementById("metaverse-scene");
    if (!sceneEl) return;
    if (!metaverseAgents.length) {
        sceneEl.innerHTML = `<div class="agent-memory-empty">No agents available for the scene yet.</div>`;
        return;
    }

    const items = metaverseAgents.slice(0, 12).map((agent, idx) => {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        const left = 12 + col * 24 + ((row % 2) * 5);
        const top = 12 + row * 30;
        const level = Number(agent.level || 1);
        return `
            <article class="meta-zone" style="left:${left}%; top:${top}%;">
                <div class="meta-zone-avatar">${avatarBadgeHtml(agent.specialty)}</div>
                <div class="meta-zone-name">${escapeHtml(agent.name || agent.specialty)}</div>
                <div class="meta-zone-tag">${escapeHtml(agent.specialty || "personal")} · L${level}</div>
                <div class="meta-zone-actions">
                    <button type="button" class="meta-zone-btn" data-zone-action="talk" data-specialty="${escapeHtml(agent.specialty)}" data-name="${escapeHtml(agent.name || agent.specialty)}">Talk</button>
                    <button type="button" class="meta-zone-btn alt" data-zone-action="train" data-specialty="${escapeHtml(agent.specialty)}" data-name="${escapeHtml(agent.name || agent.specialty)}">Train</button>
                </div>
            </article>
        `;
    }).join("");

    sceneEl.innerHTML = `
        <div class="meta-orbit orbit-one"></div>
        <div class="meta-orbit orbit-two"></div>
        ${items}
    `;
}

function renderMetaverseAgentPorts() {
    const portsEl = document.getElementById("metaverse-agent-ports");
    if (!portsEl) return;
    if (!metaverseAgents.length) {
        portsEl.innerHTML = `<div class="agent-memory-empty">Agent ports will appear after stats load.</div>`;
        return;
    }
    portsEl.innerHTML = metaverseAgents.slice(0, 10).map((agent) => `
        <div class="meta-port">
            <div class="meta-port-main">
                <strong>${avatarBadgeHtml(agent.specialty)} ${escapeHtml(agent.name || agent.specialty)}</strong>
                <span>${escapeHtml(agent.specialty || "personal")} · ${escapeHtml(agent.category || "personal")}</span>
            </div>
            <div class="meta-port-actions">
                <button type="button" class="meta-zone-btn" data-zone-action="talk" data-specialty="${escapeHtml(agent.specialty)}" data-name="${escapeHtml(agent.name || agent.specialty)}">Open Chat</button>
                <button type="button" class="meta-zone-btn alt" data-zone-action="train" data-specialty="${escapeHtml(agent.specialty)}" data-name="${escapeHtml(agent.name || agent.specialty)}">Boost</button>
            </div>
        </div>
    `).join("");
}

async function refreshMetaverseFeatures() {
    renderAvatarStudioCard();
    refreshMetaverseMarket();
}

function renderAvatarStudioCard(useControlValues = false) {
    const cardEl = document.getElementById("metaverse-avatar-card");
    const agentSelect = document.getElementById("avatar-agent-select");
    const shapeSelect = document.getElementById("avatar-shape-select");
    const colorInput = document.getElementById("avatar-color-input");
    if (!cardEl || !agentSelect || !shapeSelect || !colorInput) return;

    const specialty = (agentSelect.value || currentAgentSpecialty || "personal").trim().toLowerCase();
    const profile = getAvatarProfile(specialty);
    if (!useControlValues) {
        shapeSelect.value = avatarClassName(profile.shape);
        colorInput.value = String(profile.color || "#22d3ee");
    }
    const liveShape = avatarClassName(shapeSelect.value || profile.shape);
    const liveColor = String(colorInput.value || profile.color || "#22d3ee");

    const agent = metaverseAgents.find((a) => String(a.specialty || "").toLowerCase() === specialty) || {};
    const level = Number(agent.level || 1);
    const accuracy = Math.max(0, Math.min(100, Number(agent.accuracy || 0)));
    cardEl.innerHTML = `
        <div class="meta-avatar-preview">
            <span class="meta-agent-avatar ${escapeHtml(liveShape)}" style="--agent-avatar-color:${escapeHtml(liveColor)}"></span>
            <div class="meta-avatar-meta">
                <strong>${escapeHtml(agent.name || specialty)}</strong>
                <span>${escapeHtml(specialty)} · L${level}</span>
                <span>${accuracy.toFixed(1)}% mastery</span>
            </div>
        </div>
        <p class="meta-avatar-note">2D avatar/status card. Customize shape and color per agent.</p>
        <button type="button" class="meta-zone-btn" data-avatar-action="train-chat" data-specialty="${escapeHtml(specialty)}">Open Training Chat</button>
    `;
}

function saveAvatarStudioProfile() {
    const agentSelect = document.getElementById("avatar-agent-select");
    const shapeSelect = document.getElementById("avatar-shape-select");
    const colorInput = document.getElementById("avatar-color-input");
    if (!agentSelect || !shapeSelect || !colorInput) return;
    const specialty = (agentSelect.value || "").trim().toLowerCase();
    if (!specialty) return;
    const profiles = loadAgentAvatarProfiles();
    profiles[specialty] = {
        shape: avatarClassName(shapeSelect.value),
        color: String(colorInput.value || "#22d3ee"),
    };
    saveAgentAvatarProfiles(profiles);
    renderAvatarStudioCard();
    renderMetaverseScene();
    renderMetaverseAgentPorts();
    toast(`Avatar saved for ${specialty}`);
}

async function refreshMetaverseMarket() {
    const listEl = document.getElementById("metaverse-market-list");
    if (!listEl) return;
    try {
        const res = await fetch("/chain/marketplace");
        const data = await res.json();
        const listed = Array.isArray(data.listed) ? data.listed : [];
        if (!listed.length) {
            listEl.innerHTML = `<div class="agent-memory-empty">No listed agents right now.</div>`;
            return;
        }
        listEl.innerHTML = listed.slice(0, 8).map((item) => `
            <div class="market-item">
                <div class="market-main">
                    <strong>${escapeHtml(item.agent_name || item.specialty)}</strong>
                    <span>${escapeHtml(item.specialty || "-")} · ${escapeHtml(String(item.price_sol || "-"))} SOL</span>
                </div>
                <div class="market-sub">Owner: ${escapeHtml(item.owner || "-")}</div>
                <div class="meta-market-actions">
                    <button class="chain-action" data-action="buy" data-specialty="${escapeHtml(item.specialty)}">Buy</button>
                    <button class="chain-action" data-action="rent" data-specialty="${escapeHtml(item.specialty)}">Rent</button>
                </div>
            </div>
        `).join("");
    } catch (_) {}
}

function renderMetaversePresence() {
    const root = document.getElementById("metaverse-presence");
    const zoneSelect = document.getElementById("metaverse-zone-select");
    const statusSelect = document.getElementById("metaverse-status-select");
    if (!root) return;
    const me = metaverseState?.me || null;
    const online = Array.isArray(metaverseState?.online) ? metaverseState.online : [];

    if (zoneSelect && me?.zone) zoneSelect.value = me.zone;
    if (statusSelect && me?.status) statusSelect.value = me.status;

    if (!me) {
        root.innerHTML = `<div class="agent-memory-empty">Join the world to start presence sync.</div>`;
        return;
    }

    const peers = online.slice(0, 8).map((row) => `
        <div class="meta-presence-peer">
            <strong>${escapeHtml(row.display_name || "user")}</strong>
            <span>${escapeHtml(row.zone_label || row.zone || "zone")} · ${escapeHtml(row.status || "online")}</span>
        </div>
    `).join("");

    root.innerHTML = `
        <div class="meta-presence-self">
            <strong>${escapeHtml(me.display_name || "You")}</strong>
            <span>${escapeHtml(me.zone_label || me.zone || "Central Hub")} · ${escapeHtml(me.status || "online")}</span>
            ${me.mission ? `<p>${escapeHtml(me.mission)}</p>` : `<p>No active mission set.</p>`}
        </div>
        <div class="meta-presence-list">
            ${peers || `<div class="agent-memory-empty">No other presences yet.</div>`}
        </div>
    `;
}

async function refreshMetaverseState() {
    try {
        const requester = getActingAs();
        const res = await fetch("/metaverse/state?requester=" + encodeURIComponent(requester));
        const data = await res.json();
        metaverseState = {
            zones: Array.isArray(data.zones) ? data.zones : [],
            me: data.me || null,
            online: Array.isArray(data.online) ? data.online : []
        };
        renderMetaversePresence();
    } catch (_) {}
}

async function syncMetaversePresence() {
    const zoneSelect = document.getElementById("metaverse-zone-select");
    const statusSelect = document.getElementById("metaverse-status-select");
    const requester = getActingAs();
    const zone = (zoneSelect?.value || "").trim() || "hub";
    const status = (statusSelect?.value || "").trim() || "online";
    try {
        await fetch("/metaverse/travel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requester, zone, status })
        });
        await refreshMetaverseState();
        toast(`Metaverse synced: ${zone}`);
    } catch (_) {
        toast("Metaverse sync failed");
    }
}

async function refreshAgentMemory() {
    const historyEl = document.getElementById("agent-memory-history");
    const metaEl = document.getElementById("agent-memory-meta");
    if (!historyEl || !metaEl) return;
    try {
        const requester = getActingAs();
        const res = await fetch(`/agent-memory?specialty=${encodeURIComponent(currentAgentSpecialty)}&limit=10&requester=${encodeURIComponent(requester)}`);
        const data = await res.json();

        const factText = (data.facts || []).slice(-2).map((f) => `<li>${escapeHtml(f)}</li>`).join("");
        const freshFacts = Array.isArray(data.facts) ? data.facts.map((f) => String(f || "").trim()).filter(Boolean) : [];
        if (freshFacts.length) {
            const merged = [...freshFacts, ...memoryTickerFacts].filter(Boolean);
            memoryTickerFacts = Array.from(new Set(merged)).slice(0, 20);
        }
        metaEl.innerHTML = `
            <div><strong>${escapeHtml(data.name || "Agent")}</strong> · Level ${Number(data.level || 1)}</div>
            ${factText ? `<ul class="memory-facts">${factText}</ul>` : ""}
        `;

        const history = data.history || [];
        if (!history.length) {
            historyEl.innerHTML = `<div class="agent-memory-empty">No recent messages yet.</div>`;
            return;
        }
        historyEl.innerHTML = history.map((item) => `
            <div class="memory-item ${item.role === "user" ? "user" : "ai"}">
                <span class="role">${item.role === "user" ? "You" : "Agent"}</span>
                <span class="text">${escapeHtml(item.content)}</span>
            </div>
        `).join("");
    } catch (_) {}
}

function reminderPriorityMessage(now = new Date()) {
    const pending = reminderItemsCache
        .filter((item) => !item?.done && item?.due_at)
        .map((item) => {
            const due = new Date(item.due_at);
            return { item, due, mins: Math.round((due.getTime() - now.getTime()) / 60000) };
        })
        .filter((row) => Number.isFinite(row.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime());
    if (!pending.length) return "";
    const next = pending[0];
    if (next.mins <= 0) {
        return `Lumiere remembers: Priority reminder now - ${next.item.text}`;
    }
    if (next.mins <= 30) {
        return `Lumiere remembers: Priority reminder in ${next.mins} min - ${next.item.text}`;
    }
    return "";
}

function renderRemembersFooter() {
    const footer = document.getElementById("remembers-footer");
    if (!footer) return;
    const urgent = reminderPriorityMessage();
    if (urgent) {
        footer.textContent = urgent;
        footer.classList.add("urgent");
        return;
    }
    footer.classList.remove("urgent");
    if (memoryTickerFacts.length) {
        const idx = Math.max(0, Math.min(memoryTickerFacts.length - 1, memoryTickerIndex));
        footer.textContent = `Lumiere remembers: ${memoryTickerFacts[idx]}`;
        return;
    }
    footer.textContent = "Lumiere remembers: still learning your preferences.";
}

function advanceMemoryTicker() {
    if (reminderPriorityMessage()) {
        renderRemembersFooter();
        return;
    }
    if (memoryTickerFacts.length > 1) {
        memoryTickerIndex = (memoryTickerIndex + 1) % memoryTickerFacts.length;
    }
    renderRemembersFooter();
}

async function refreshMemoryFact() {
    try {
        const requester = getActingAs();
        const res = await fetch(`/memory-fact?specialty=${encodeURIComponent(currentAgentSpecialty)}&requester=${encodeURIComponent(requester)}`);
        const data = await res.json();
        const fact = String(data?.fact || "").trim();
        if (fact) {
            const already = memoryTickerFacts.includes(fact);
            memoryTickerFacts = Array.from(new Set([fact, ...memoryTickerFacts])).slice(0, 20);
            if (!already) memoryTickerIndex = 0;
        }
        renderRemembersFooter();
    } catch (_) {}
}

function renderReminders(items) {
    const list = document.getElementById("reminder-list");
    if (!list) return;
    if (!items.length) {
        list.innerHTML = `<div class="agent-memory-empty">No reminders yet.</div>`;
        return;
    }
    const fmtDue = (raw) => {
        if (!raw) return "";
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return "";
        return dt.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    };
    list.innerHTML = items.map((item) => `
        <div class="reminder-item ${item.done ? "done" : ""}">
            <button class="reminder-toggle" data-id="${item.id}" title="Toggle">
                ${item.done ? "Done" : "Todo"}
            </button>
            <div class="reminder-text">
                <div>${escapeHtml(item.text)}</div>
                ${item.due_at ? `<small class="reminder-due">Due: ${escapeHtml(fmtDue(item.due_at) || item.due_at)}</small>` : ""}
            </div>
            <button class="reminder-delete" data-id="${item.id}" title="Delete">X</button>
        </div>
    `).join("");
}

async function refreshReminders() {
    try {
        const res = await fetch("/reminders");
        const items = await res.json();
        reminderItemsCache = Array.isArray(items) ? items : [];
        renderReminders(reminderItemsCache);
        renderRemembersFooter();
    } catch (_) {}
}

function unlockReminderAudio() {
    if (reminderAudioReady) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        reminderAudioCtx = reminderAudioCtx || new Ctx();
        if (reminderAudioCtx.state === "suspended") {
            reminderAudioCtx.resume().catch(() => {});
        }
        reminderAudioReady = true;
    } catch (_) {}
}

function playReminderSound() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        reminderAudioCtx = reminderAudioCtx || new Ctx();
        if (reminderAudioCtx.state === "suspended") {
            reminderAudioCtx.resume().catch(() => {});
        }
        const now = reminderAudioCtx.currentTime;
        const tone = (freq, start, duration) => {
            const osc = reminderAudioCtx.createOscillator();
            const gain = reminderAudioCtx.createGain();
            osc.type = "triangle";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.connect(gain);
            gain.connect(reminderAudioCtx.destination);
            osc.start(start);
            osc.stop(start + duration + 0.02);
        };
        // Stronger attention pattern.
        tone(880, now, 0.14);
        tone(1040, now + 0.16, 0.14);
        tone(740, now + 0.34, 0.18);
        tone(880, now + 0.56, 0.16);
        if ("vibrate" in navigator) {
            navigator.vibrate([160, 80, 180, 90, 220]);
        }
    } catch (_) {}
}

function speakReminderText(text) {
    try {
        const msg = String(text || "").trim();
        if (!msg) return;
        speakText(`Reminder due now. ${msg}`, { rate: 0.95, pitch: 1.07, volume: 1 });
    } catch (_) {}
}

function showReminderAlert(items) {
    const overlay = document.getElementById("reminder-alert-overlay");
    const list = document.getElementById("reminder-alert-list");
    if (!overlay || !list) return;
    const rows = (items || []).slice(0, 4);
    if (!rows.length) return;
    const fmtDue = (raw) => {
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return "";
        return dt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    };
    list.innerHTML = rows.map((item) => `
        <div class="reminder-alert-row">
            <span>${escapeHtml(String(item.text || "Reminder"))}</span>
            ${item?.due_at ? `<small>Due: ${escapeHtml(fmtDue(item.due_at) || String(item.due_at))}</small>` : ""}
        </div>
    `).join("");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
}

async function pollDueReminders() {
    try {
        const res = await fetch("/reminders/due?channel=browser&max_items=3");
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!items.length) return;
        playReminderSound();
        const fresh = [];
        items.forEach((item) => {
            const rid = String(item?.id || item?.text || "");
            const last = Number(reminderAlertSeen.get(rid) || 0);
            if (Date.now() - last > 90000) {
                reminderAlertSeen.set(rid, Date.now());
                fresh.push(item);
            }
            const label = String(item?.text || "Reminder");
            toast(`Reminder due: ${label}`);
        });
        if (fresh.length) {
            const spoken = fresh.map((x) => x.text).filter(Boolean).join(". ");
            showReminderAlert(fresh);
            speakReminderText(spoken);
            window.clearTimeout(reminderSpeechRepeatTimer);
            reminderSpeechRepeatTimer = window.setTimeout(() => {
                speakReminderText(spoken);
                playReminderSound();
            }, 7000);
            if ("Notification" in window && document.visibilityState !== "visible") {
                if (Notification.permission === "granted") {
                    new Notification("Lumiere Reminder Due", { body: spoken || "You have a due reminder." });
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then((perm) => {
                        if (perm === "granted") {
                            new Notification("Lumiere Reminder Due", { body: spoken || "You have a due reminder." });
                        }
                    }).catch(() => {});
                }
            }
        }
        refreshReminders();
        renderRemembersFooter();
    } catch (_) {}
}

async function addReminder() {
    const input = document.getElementById("reminder-input");
    const text = (input?.value || "").trim();
    if (!text) return;
    try {
        const res = await fetch("/reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.status === "ok") {
            if (input) input.value = "";
            toast("Reminder added");
            refreshReminders();
        } else {
            toast("Failed to add reminder");
        }
    } catch (_) {
        toast("Failed to add reminder");
    }
}

function wireVoiceInput() {
    const btn = document.getElementById("voice-btn");
    const input = document.getElementById("question");
    if (!btn || !input) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        btn.disabled = true;
        btn.title = "Voice input not supported in this browser";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("result", (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        input.value = transcript;
        input.focus();
    });
    recognition.addEventListener("start", () => btn.classList.add("active"));
    recognition.addEventListener("end", () => btn.classList.remove("active"));
    recognition.addEventListener("error", () => btn.classList.remove("active"));

    btn.addEventListener("click", () => {
        try {
            recognition.start();
        } catch (_) {}
    });
}

const TOUR_STEPS = [
    { title: "Chat", text: "Ask a question here. Keep prompts short and clear.", view: "chat", target: "#question" },
    { title: "Agents", text: "See your agent strengths and levels on this page.", view: "agents", target: ".agent-stats" },
    { title: "Memory", text: "Edit memory notes and scopes in this page.", view: "memory", target: "#memory-management-panel" },
    { title: "Compare", text: "Compare two agents with radar or table view.", view: "compare", target: "#compare-radar-wrap" },
    { title: "History", text: "Save chats and reopen old sessions fast.", view: "history", target: "#history-panel" },
    { title: "Settings", text: "Use Settings to change theme, accent, and model.", view: "chat", target: "#settings-open-btn" },
];

function clearTourTargetHighlight() {
    document.querySelectorAll(".tour-target-focus").forEach((el) => el.classList.remove("tour-target-focus"));
}

function placeTourCardNear(targetEl) {
    const card = document.querySelector("#tour-overlay .tour-card");
    if (!card) return;
    if (!targetEl || window.innerWidth < 900) {
        card.style.removeProperty("--tour-top");
        card.style.removeProperty("--tour-left");
        card.classList.remove("point-left", "point-right");
        return;
    }
    const rect = targetEl.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > window.innerHeight) {
        card.style.removeProperty("--tour-top");
        card.style.removeProperty("--tour-left");
        card.classList.remove("point-left", "point-right");
        return;
    }
    const cardRect = card.getBoundingClientRect();
    const cardW = Math.max(290, Math.min(430, cardRect.width || 340));
    const cardH = Math.max(180, cardRect.height || 220);
    const gap = 16;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    let left = 0;
    let pointLeft = false;
    let pointRight = false;
    if (spaceRight >= cardW + gap) {
        left = rect.right + gap;
        pointLeft = true;
    } else if (spaceLeft >= cardW + gap) {
        left = rect.left - cardW - gap;
        pointRight = true;
    } else {
        left = rect.left + (rect.width / 2) - (cardW / 2);
    }
    const clampedLeft = Math.max(12, Math.min(window.innerWidth - cardW - 12, left));
    const top = Math.max(12, Math.min(window.innerHeight - cardH - 12, rect.top + (rect.height * 0.5) - (cardH * 0.5)));
    card.style.setProperty("--tour-top", `${top}px`);
    card.style.setProperty("--tour-left", `${clampedLeft}px`);
    card.classList.toggle("point-left", pointLeft);
    card.classList.toggle("point-right", pointRight);
}

function renderTourStep() {
    const title = document.getElementById("tour-title");
    const text = document.getElementById("tour-text");
    const next = document.getElementById("tour-next-btn");
    const step = TOUR_STEPS[tourStep] || TOUR_STEPS[0];
    if (step?.view) {
        applyView(step.view);
    }
    if (step?.target === "#settings-open-btn") {
        closeSettingsDrawer();
    }
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (next) next.textContent = tourStep >= TOUR_STEPS.length - 1 ? "Finish" : "Next";
    clearTourTargetHighlight();
    const target = step?.target ? document.querySelector(step.target) : null;
    if (target) target.classList.add("tour-target-focus");
    placeTourCardNear(target);
}

function openTour() {
    const overlay = document.getElementById("tour-overlay");
    if (!overlay) return;
    tourStep = 0;
    renderTourStep();
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
}

function closeTour(done = false) {
    const overlay = document.getElementById("tour-overlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    clearTourTargetHighlight();
    if (done) localStorage.setItem(ONBOARDING_TOUR_KEY, "1");
}

document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const savedTheme = localStorage.getItem("theme") || "system";
    const savedAccent = localStorage.getItem("accent") || body.dataset.accent || "#22d3ee";
    const currentModel = body.dataset.currentModel || "groq-llama3.3";

    applyTheme(savedTheme);
    setAccent(savedAccent);
    syncActorWithProfileIfProfileChanged();

    const accentSelect = document.getElementById("accent-select");
    if (accentSelect) accentSelect.value = savedAccent;

    const modelSelect = document.getElementById("model-select");
    if (modelSelect) modelSelect.value = currentModel;

    renderAvatar(loadAvatarState(), false);
    setTtsEnabled(isTtsEnabled());
    refreshAgentStats();
    refreshAgentMemory();
    refreshMemoryFact();
    refreshReminders();
    pollDueReminders();
    refreshUploadedContext();
    refreshMarketplace();
    refreshUsageLog();
    refreshHistoryList();
    refreshAuthState();
    refreshAuthMode();
    refreshMemoryControls();
    refreshEvaluationAndQuality();
    setInterval(refreshAgentStats, 20000);
    setInterval(refreshMemoryFact, 24000);
    setInterval(pollDueReminders, 20000);
    setInterval(advanceMemoryTicker, 120000);

    const input = document.getElementById("question");
    const sendBtn = document.getElementById("send-btn");
    const debateBtn = document.getElementById("debate-btn");
    const webBtn = document.getElementById("web-btn");
    const resetBtn = document.getElementById("avatar-reset-btn");
    const historySaveBtn = document.getElementById("history-save-btn");
    const historyTitleInput = document.getElementById("history-title-input");
    const historySearchInput = document.getElementById("history-search-input");
    const historyList = document.getElementById("history-list");
    const reminderAddBtn = document.getElementById("reminder-add-btn");
    const reminderInput = document.getElementById("reminder-input");
    const onboardingBanner = document.getElementById("onboarding-banner");
    const onboardingClose = document.getElementById("onboarding-close");
    const onboardingTourBtn = document.getElementById("onboarding-tour-btn");
    const tourNextBtn = document.getElementById("tour-next-btn");
    const tourSkipBtn = document.getElementById("tour-skip-btn");
    const exportTxtBtn = document.getElementById("export-txt-btn");
    const exportJsonBtn = document.getElementById("export-json-btn");
    const uploadInput = document.getElementById("file-upload-input");
    const clearUploadedBtn = document.getElementById("clear-uploaded-btn");
    const chatPanel = document.getElementById("chat-panel");
    const ttsToggleBtn = document.getElementById("tts-toggle-btn");
    const actorInput = document.getElementById("actor-input");
    const actorApplyBtn = document.getElementById("actor-apply-btn");
    const pageNav = document.getElementById("page-nav");
    const workspaceSelect = document.getElementById("workspace-select");
    const newChatBtn = document.getElementById("new-chat-btn");
    const metaverseScene = document.getElementById("metaverse-scene");
    const metaversePorts = document.getElementById("metaverse-agent-ports");
    const metaverseVideoList = document.getElementById("metaverse-video-list");
    const metaverseVideoTopicInput = document.getElementById("metaverse-video-topic-input");
    const metaverseVideoSearchBtn = document.getElementById("metaverse-video-search-btn");
    const metaverseVideoQuestion = document.getElementById("metaverse-video-question");
    const metaverseVideoAskBtn = document.getElementById("metaverse-video-ask-btn");
    const metaversePresenceApplyBtn = document.getElementById("metaverse-presence-apply-btn");
    const metaverseAvatarCard = document.getElementById("metaverse-avatar-card");
    const avatarAgentSelect = document.getElementById("avatar-agent-select");
    const avatarShapeSelect = document.getElementById("avatar-shape-select");
    const avatarColorInput = document.getElementById("avatar-color-input");
    const avatarSaveBtn = document.getElementById("avatar-save-btn");
    const metaverseMarketList = document.getElementById("metaverse-market-list");
    const settingsOpenBtn = document.getElementById("settings-open-btn");
    const settingsCloseBtn = document.getElementById("settings-close-btn");
    const settingsDrawer = document.getElementById("settings-drawer");
    const privacyQuickBtn = document.getElementById("privacy-quick-btn");
    const privacyToggle = document.getElementById("privacy-toggle");
    const authLoginBtn = document.getElementById("auth-login-btn");
    const authRegisterBtn = document.getElementById("auth-register-btn");
    const authLogoutBtn = document.getElementById("auth-logout-btn");
    const authModeToggle = document.getElementById("auth-required-toggle");
    const authModeSaveBtn = document.getElementById("auth-mode-save-btn");
    const memoryScopesSaveBtn = document.getElementById("memory-scopes-save-btn");
    const memoryRefreshBtn = document.getElementById("memory-refresh-btn");
    const memoryAddBtn = document.getElementById("memory-add-btn");
    const memoryNewText = document.getElementById("memory-new-text");
    const memoryItemsList = document.getElementById("memory-items-list");
    const evaluationRefreshBtn = document.getElementById("evaluation-refresh-btn");
    const regressionRunBtn = document.getElementById("regression-run-btn");
    const checkpointCreateBtn = document.getElementById("checkpoint-create-btn");
    const checkpointList = document.getElementById("checkpoint-list");
    const compareRefreshBtn = document.getElementById("compare-refresh-btn");
    const compareAgentA = document.getElementById("compare-agent-a");
    const compareAgentB = document.getElementById("compare-agent-b");
    const compareToggle = document.getElementById("compare-toggle");
    const reminderAlertClose = document.getElementById("reminder-alert-close");
    const reminderAlertOverlay = document.getElementById("reminder-alert-overlay");
    const autoTranslateToggle = document.getElementById("auto-translate-toggle");
    const translateSourceInput = document.getElementById("translate-source-lang");
    const translateTargetInput = document.getElementById("translate-target-lang");

    if (autoTranslateToggle) {
        autoTranslateToggle.checked = isAutoTranslateEnabled();
        autoTranslateToggle.addEventListener("change", () => {
            setAutoTranslateEnabled(!!autoTranslateToggle.checked);
            toast(`Auto translate ${autoTranslateToggle.checked ? "enabled" : "disabled"}`);
        });
    }
    if (translateSourceInput) {
        translateSourceInput.value = getTranslateSourceLang();
        translateSourceInput.addEventListener("change", () => {
            setTranslateSourceLang(translateSourceInput.value || "auto");
        });
    }
    if (translateTargetInput) {
        translateTargetInput.value = getTranslateTargetLang();
        translateTargetInput.addEventListener("change", () => {
            setTranslateTargetLang(translateTargetInput.value || "en");
        });
    }

    if (localStorage.getItem(ONBOARDING_KEY) === "1" && onboardingBanner) {
        onboardingBanner.style.display = "none";
    }
    if (onboardingClose) {
        onboardingClose.addEventListener("click", () => {
            localStorage.setItem(ONBOARDING_KEY, "1");
            if (onboardingBanner) onboardingBanner.style.display = "none";
        });
    }
    if (onboardingTourBtn) onboardingTourBtn.addEventListener("click", openTour);
    if (tourNextBtn) {
        tourNextBtn.addEventListener("click", () => {
            if (tourStep >= TOUR_STEPS.length - 1) {
                closeTour(true);
                toast("Tour complete");
                return;
            }
            tourStep += 1;
            renderTourStep();
        });
    }
    if (tourSkipBtn) {
        tourSkipBtn.addEventListener("click", () => closeTour(true));
    }
    if (localStorage.getItem(ONBOARDING_TOUR_KEY) !== "1" && localStorage.getItem(ONBOARDING_KEY) !== "1") {
        window.setTimeout(() => openTour(), 650);
    }

    if (ttsToggleBtn) {
        ttsToggleBtn.addEventListener("click", () => setTtsEnabled(!isTtsEnabled()));
    }
    if (actorInput) actorInput.value = getActingAs();
    refreshIdentityHint();
    refreshPrivacySetting();
    if (actorApplyBtn) {
        actorApplyBtn.addEventListener("click", () => setActingAs(actorInput?.value || ""));
    }
    if (actorInput) {
        actorInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                setActingAs(actorInput.value || "");
            }
        });
    }
    if (exportTxtBtn) exportTxtBtn.addEventListener("click", exportChatAsText);
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportChatAsJson);
    if (uploadInput) {
        uploadInput.addEventListener("change", async (e) => {
            await uploadFilesBatch(e.target.files || []);
            uploadInput.value = "";
        });
    }
    if (clearUploadedBtn) {
        clearUploadedBtn.addEventListener("click", async () => {
            try {
                await fetch("/uploaded-context", { method: "DELETE" });
                refreshUploadedContext();
                toast("Uploaded context cleared");
            } catch (_) {}
        });
    }

    const openSettings = () => {
        if (!settingsDrawer) return;
        openSettingsDrawer();
        refreshAuthState();
        refreshAuthMode();
        refreshMemoryControls();
        refreshEvaluationAndQuality();
    };
    const closeSettings = () => {
        closeSettingsDrawer();
    };
    if (settingsOpenBtn) settingsOpenBtn.addEventListener("click", openSettings);
    if (privacyQuickBtn) privacyQuickBtn.addEventListener("click", openSettings);
    if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
    const settingsOverlay = document.getElementById("settings-overlay");
    if (settingsOverlay) settingsOverlay.addEventListener("click", closeSettings);
    if (privacyToggle) {
        privacyToggle.addEventListener("change", () => savePrivacySetting(privacyToggle.checked));
    }
    if (authLoginBtn) authLoginBtn.addEventListener("click", () => authLogin());
    if (authRegisterBtn) authRegisterBtn.addEventListener("click", () => authRegister());
    if (authLogoutBtn) authLogoutBtn.addEventListener("click", () => authLogout());
    if (authModeSaveBtn) {
        authModeSaveBtn.addEventListener("click", () => saveAuthMode(!!authModeToggle?.checked));
    }
    if (memoryScopesSaveBtn) memoryScopesSaveBtn.addEventListener("click", () => saveMemoryScopesFromUi());
    if (memoryRefreshBtn) memoryRefreshBtn.addEventListener("click", () => refreshMemoryControls());
    if (memoryAddBtn) memoryAddBtn.addEventListener("click", () => addMemoryItemFromUi());
    if (memoryNewText) {
        memoryNewText.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addMemoryItemFromUi();
            }
        });
    }
    if (evaluationRefreshBtn) evaluationRefreshBtn.addEventListener("click", () => refreshEvaluationAndQuality());
    if (regressionRunBtn) regressionRunBtn.addEventListener("click", () => runRegressionFromUi());
    if (checkpointCreateBtn) checkpointCreateBtn.addEventListener("click", () => createCheckpointFromUi());
    if (compareRefreshBtn) compareRefreshBtn.addEventListener("click", () => refreshAgentStats());
    if (compareAgentA) compareAgentA.addEventListener("change", () => renderAgentComparison());
    if (compareAgentB) compareAgentB.addEventListener("change", () => renderAgentComparison());
    if (compareToggle) {
        compareToggle.addEventListener("click", (e) => {
            const btn = e.target.closest(".compare-toggle-btn");
            if (!btn) return;
            setCompareMode(btn.dataset.mode || "radar");
            renderAgentComparison();
        });
    }
    if (reminderAlertClose) {
        reminderAlertClose.addEventListener("click", () => {
            if (reminderAlertOverlay) {
                reminderAlertOverlay.classList.remove("open");
                reminderAlertOverlay.setAttribute("aria-hidden", "true");
            }
        });
    }
    if (memoryItemsList) {
        memoryItemsList.addEventListener("click", (e) => {
            const delBtn = e.target.closest(".memory-del-btn");
            const editBtn = e.target.closest(".memory-edit-btn");
            if (delBtn?.dataset.id) {
                deleteMemoryItemFromUi(delBtn.dataset.id);
            } else if (editBtn?.dataset.id) {
                updateMemoryItemFromUi(editBtn.dataset.id);
            }
        });
    }
    if (checkpointList) {
        checkpointList.addEventListener("click", (e) => {
            const promoteBtn = e.target.closest(".checkpoint-promote-btn");
            if (promoteBtn?.dataset.id) {
                promoteCheckpointFromUi(promoteBtn.dataset.id);
            }
        });
    }
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSettings();
            closeTour(false);
        }
    });

    if (chatPanel) {
        chatPanel.addEventListener("dragover", (e) => {
            e.preventDefault();
            chatPanel.classList.add("drag-upload-active");
        });
        chatPanel.addEventListener("dragleave", () => {
            chatPanel.classList.remove("drag-upload-active");
        });
        chatPanel.addEventListener("drop", async (e) => {
            e.preventDefault();
            chatPanel.classList.remove("drag-upload-active");
            const files = Array.from(e.dataTransfer?.files || []);
            if (!files.length) return;
            await uploadFilesBatch(files);
            toast(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
        });
    }

    if (pageNav) {
        pageNav.addEventListener("click", (e) => {
            const tab = e.target.closest(".page-tab[data-view]");
            if (!tab) return;
            applyView(tab.dataset.view);
        });
    }
    if (workspaceSelect) {
        workspaceSelect.addEventListener("change", () => applyView(workspaceSelect.value));
    }
    if (newChatBtn) {
        newChatBtn.addEventListener("click", () => startNewChat());
    }
    applyView(localStorage.getItem(VIEW_KEY) || "chat");
    setCompareMode("radar");
    renderRemembersFooter();

    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
            }
        });
    }
    document.addEventListener("paste", async (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const files = items
            .filter((it) => it.kind === "file")
            .map((it) => it.getAsFile())
            .filter(Boolean);
        if (files.length) {
            e.preventDefault();
            await uploadFilesBatch(files);
            toast(`Pasted ${files.length} file${files.length > 1 ? "s" : ""}`);
            return;
        }
        if (!input) return;
        const text = e.clipboardData?.getData("text/plain") || "";
        if (!text.trim()) return;
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        input.value = [input.value, text].filter(Boolean).join(input.value ? "\n" : "");
        input.focus();
        toast("Pasted text into prompt");
    });

    if (sendBtn) sendBtn.addEventListener("click", () => ask());
    if (debateBtn) debateBtn.addEventListener("click", () => askDebate());
    if (webBtn) webBtn.addEventListener("click", () => askLiveWeb());
    if (resetBtn) resetBtn.addEventListener("click", resetAvatar);
    if (historySaveBtn) historySaveBtn.addEventListener("click", () => saveCurrentChatToHistory());
    if (historySearchInput) {
        historySearchInput.addEventListener("input", () => {
            renderHistoryList(historySessionsCache, historySearchInput.value || "");
        });
    }
    if (historyTitleInput) {
        historyTitleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveCurrentChatToHistory();
            }
        });
    }
    if (reminderAddBtn) reminderAddBtn.addEventListener("click", addReminder);
    if (reminderInput) {
        reminderInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addReminder();
            }
        });
    }

    document.querySelectorAll(".prompt-chip").forEach((chip) => {
        chip.addEventListener("click", async () => {
            const prompt = chip.dataset.prompt || "";
            try {
                await fetch("/signal/suggestion", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt,
                        requester: getActingAs(),
                        specialty: currentAgentSpecialty || "personal"
                    })
                });
            } catch (_) {}
            ask(prompt);
        });
    });

    const agentStats = document.querySelector(".agent-stats");
    if (agentStats) {
        agentStats.addEventListener("click", (e) => {
            const btn = e.target.closest(".chain-action");
            if (!btn) return;
            chainAction(btn.dataset.action, btn.dataset.specialty);
        });
    }

    const marketList = document.getElementById("marketplace-list");
    if (marketList) {
        marketList.addEventListener("click", (e) => {
            const btn = e.target.closest(".chain-action");
            if (!btn) return;
            chainAction(btn.dataset.action, btn.dataset.specialty);
        });
    }
    const marketManageList = document.getElementById("marketplace-manage-list");
    if (marketManageList) {
        marketManageList.addEventListener("click", (e) => {
            const btn = e.target.closest(".chain-action");
            if (!btn) return;
            chainAction(btn.dataset.action, btn.dataset.specialty);
        });
    }
    if (metaverseMarketList) {
        metaverseMarketList.addEventListener("click", (e) => {
            const btn = e.target.closest(".chain-action");
            if (!btn) return;
            chainAction(btn.dataset.action, btn.dataset.specialty);
        });
    }

    const bindMetaverseActions = (rootEl) => {
        if (!rootEl) return;
        rootEl.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-zone-action]");
            if (!btn) return;
            handleMetaverseZoneAction(btn.dataset.zoneAction, btn.dataset.specialty, btn.dataset.name);
        });
    };
    bindMetaverseActions(metaverseScene);
    bindMetaverseActions(metaversePorts);
    if (metaversePresenceApplyBtn) {
        metaversePresenceApplyBtn.addEventListener("click", () => syncMetaversePresence());
    }
    if (avatarAgentSelect) {
        avatarAgentSelect.addEventListener("change", () => renderAvatarStudioCard());
    }
    if (avatarShapeSelect) {
        avatarShapeSelect.addEventListener("change", () => renderAvatarStudioCard(true));
    }
    if (avatarColorInput) {
        avatarColorInput.addEventListener("input", () => renderAvatarStudioCard(true));
    }
    if (avatarSaveBtn) {
        avatarSaveBtn.addEventListener("click", () => saveAvatarStudioProfile());
    }
    if (metaverseAvatarCard) {
        metaverseAvatarCard.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-avatar-action]");
            if (!btn) return;
            const specialty = String(btn.dataset.specialty || "personal").trim();
            applyView("chat");
            ask(`Training session for ${specialty}: give me 3 focused exercises, then I will answer and you evaluate.`);
        });
    }

    if (metaverseVideoSearchBtn) {
        metaverseVideoSearchBtn.addEventListener("click", () => refreshMetaverseVideos(metaverseVideoTopicInput?.value || ""));
    }
    if (metaverseVideoTopicInput) {
        metaverseVideoTopicInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                refreshMetaverseVideos(metaverseVideoTopicInput.value || "");
            }
        });
    }
    if (metaverseVideoList) {
        metaverseVideoList.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-video-action]");
            if (!btn) return;
            const video = metaverseVideos.find((v) => String(v.id) === String(btn.dataset.videoId));
            if (!video) return;
            if (btn.dataset.videoAction === "preview") {
                renderMetaverseVideoHero(video);
                return;
            }
            selectedMetaverseVideo = video;
            renderMetaverseVideoHero(video);
            renderMetaverseVideoList();
            toast(`Selected video: ${video.title}`);
        });
    }
    if (metaverseVideoAskBtn) {
        metaverseVideoAskBtn.addEventListener("click", () => {
            const question = (metaverseVideoQuestion?.value || "").trim();
            if (!selectedMetaverseVideo) {
                toast("Select a video first");
                return;
            }
            if (!question) {
                toast("Enter a follow-up question");
                return;
            }
            const contextPrompt = `Use this video context:\nTitle: ${selectedMetaverseVideo.title}\nDescription: ${selectedMetaverseVideo.description}\nTags: ${(selectedMetaverseVideo.tags || []).join(", ")}\n\nQuestion: ${question}`;
            applyView("chat");
            ask(contextPrompt);
            if (metaverseVideoQuestion) metaverseVideoQuestion.value = "";
        });
    }

    const reminderList = document.getElementById("reminder-list");
    if (reminderList) {
        reminderList.addEventListener("click", async (e) => {
            const toggle = e.target.closest(".reminder-toggle");
            const del = e.target.closest(".reminder-delete");
            if (!toggle && !del) return;
            const id = toggle?.dataset.id || del?.dataset.id;
            if (!id) return;
            try {
                if (toggle) {
                    await fetch(`/reminders/${encodeURIComponent(id)}/toggle`, { method: "POST" });
                } else {
                    await fetch(`/reminders/${encodeURIComponent(id)}`, { method: "DELETE" });
                }
                refreshReminders();
            } catch (_) {}
        });
    }
    if (historyList) {
        historyList.addEventListener("click", async (e) => {
            const openBtn = e.target.closest(".history-open-btn");
            const delBtn = e.target.closest(".history-delete-btn");
            if (!openBtn && !delBtn) return;
            const id = openBtn?.dataset.id || delBtn?.dataset.id;
            if (!id) return;
            const requester = getActingAs();
            try {
                if (openBtn) {
                    const res = await fetch(`/history/sessions/${encodeURIComponent(id)}?requester=${encodeURIComponent(requester)}`);
                    const data = await res.json();
                    if (data.error) {
                        toast(data.error || "Failed to open history");
                        return;
                    }
                    hydrateChatFromHistory(data.messages || []);
                    applyView("chat");
                    toast("Loaded history session");
                    return;
                }
                await fetch(`/history/sessions/${encodeURIComponent(id)}?requester=${encodeURIComponent(requester)}`, { method: "DELETE" });
                refreshHistoryList();
                toast("History session deleted");
            } catch (_) {
                toast("History action failed");
            }
        });
    }

    const chatOutput = document.getElementById("chat-output");
    if (chatOutput) {
        chatOutput.addEventListener("click", async (e) => {
            const speakBtn = e.target.closest(".speak-btn");
            if (speakBtn) {
                const text = speakBtn.closest(".message")?.querySelector(".message-content")?.innerText || "";
                speakText(text);
                return;
            }
            const copyBtn = e.target.closest(".copy-btn");
            if (copyBtn) {
                const text = copyBtn.closest(".message")?.querySelector(".message-content")?.innerText || "";
                if (!text) return;
                try {
                    await navigator.clipboard.writeText(text);
                    toast("Copied");
                } catch (_) {
                    toast("Copy failed");
                }
                return;
            }

            const recoveryBtn = e.target.closest(".recovery-btn");
            if (recoveryBtn) {
                const action = recoveryBtn.dataset.action;
                const input = document.getElementById("question");
                if (action === "retry") {
                    retryLastFailed();
                } else if (action === "simplify") {
                    retryLastFailed(null, true);
                } else if (action === "edit") {
                    if (input && lastFailedRequest?.question) {
                        input.value = lastFailedRequest.question;
                        input.focus();
                    }
                }
                return;
            }

            const thumb = e.target.closest(".thumb-up, .thumb-down");
            if (!thumb) return;

            const messageId = thumb.dataset.messageId;
            const agent = thumb.dataset.agent || "personal";
            const value = thumb.classList.contains("thumb-up") ? 1 : -1;
            const ratingBox = thumb.closest(".thumbs-rating");
            if (ratingBox?.classList.contains("rated")) return;

            try {
                const res = await fetch("/rate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message_id: messageId,
                        value,
                        agent,
                        requester: getActingAs()
                    })
                });
                const data = await res.json();
                if (data.status === "ok") {
                    ratingBox?.classList.add("rated");
                    thumb.classList.add("selected");
                    let msg = data.mode === "global_only" ? "Feedback captured (global core only)" : "Feedback captured";
                    if (data.review_status === "accepted_saved") msg = "Feedback captured. Rented training data approved and saved.";
                    if (data.review_status === "rejected_discarded") msg = "Feedback captured. Rented training data rejected.";
                    toast(msg);
                    refreshAgentStats();
                    refreshUsageLog();
                } else {
                    toast("Feedback failed");
                }
            } catch (_) {
                toast("Feedback failed");
            }
        });
    }

    wireVoiceInput();

    ["click", "keydown", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, unlockReminderAudio, { passive: true, once: true });
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((localStorage.getItem("theme") || "system") === "system") {
            applyTheme("system");
        }
    });
    window.addEventListener("resize", () => {
        const overlay = document.getElementById("tour-overlay");
        if (overlay?.classList.contains("open")) {
            renderTourStep();
        }
    });
});

