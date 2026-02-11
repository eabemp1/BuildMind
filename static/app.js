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
let currentAgentSpecialty = "general";
let lastFailedRequest = null;
const ONBOARDING_KEY = "lumiere_onboarding_dismissed_v1";
const TTS_KEY = "lumiere_tts_enabled_v1";
const ACTOR_KEY = "lumiere_actor_v1";
const chatLog = [];

function getActingAs() {
    return (localStorage.getItem(ACTOR_KEY) || document.body?.dataset.userName || "local_user").trim();
}

function setActingAs(name) {
    const cleaned = (name || "").trim() || (document.body?.dataset.userName || "local_user");
    localStorage.setItem(ACTOR_KEY, cleaned);
    const input = document.getElementById("actor-input");
    if (input) input.value = cleaned;
    toast(`Acting as ${cleaned}`);
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
    toast("Avatar growth reset");
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
        specialty: meta.dataset.agent || "general",
        level: Number(meta.dataset.level || 1)
    };
}

function appendMessage(role, label, content, isTrustedHtml = false) {
    const output = document.getElementById("chat-output");
    if (!output) return;
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role} entering`;
    const bodyHtml = isTrustedHtml ? content : escapeHtml(content).replace(/\n/g, "<br>");
    const toolsHtml = role === "ai"
        ? `<div class="message-tools"><button class="speak-btn" type="button">Speak</button></div>`
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
}

function isTtsEnabled() {
    return localStorage.getItem(TTS_KEY) === "1";
}

function setTtsEnabled(value) {
    localStorage.setItem(TTS_KEY, value ? "1" : "0");
    const btn = document.getElementById("tts-toggle-btn");
    if (btn) btn.textContent = value ? "TTS On" : "TTS Off";
}

function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    const clean = (text || "").trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean.slice(0, 1500));
    utter.rate = 1;
    utter.pitch = 1;
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

async function ask(promptText) {
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    growAvatarByInteraction();
    setBusy(true);

    try {
        const requester = getActingAs();
        const res = await fetch("/ask?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester));
        const txt = await res.text();
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "ask");
            appendMessage("ai", "Lumiere", txt + recoveryActionsHtml(), true);
        } else {
            appendMessage("ai", "Lumiere", txt, true);
        }

        const meta = parseAgentMetaFromHtml(txt);
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact()
        ]);
    } catch (err) {
        markFailure(q, "ask");
        appendMessage("ai", "System", `Error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.value = "";
            input.focus();
        }
    }
}

async function askDebate(promptText) {
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    growAvatarByInteraction();
    setBusy(true);

    try {
        const requester = getActingAs();
        const res = await fetch("/debate?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester));
        const txt = await res.text();
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "debate");
            appendMessage("ai", "Lumiere Debate", txt + recoveryActionsHtml(), true);
        } else {
            appendMessage("ai", "Lumiere Debate", txt, true);
        }

        const meta = parseAgentMetaFromHtml(txt);
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact()
        ]);
    } catch (err) {
        markFailure(q, "debate");
        appendMessage("ai", "System", `Debate error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.value = "";
            input.focus();
        }
    }
}

async function askLiveWeb(promptText) {
    const input = document.getElementById("question");
    const q = (promptText || input?.value || "").trim();
    if (!q) return;

    appendMessage("user", "You", q, false);
    growAvatarByInteraction();
    setBusy(true);

    try {
        const requester = getActingAs();
        const res = await fetch("/ask-live?q=" + encodeURIComponent(q) + "&requester=" + encodeURIComponent(requester));
        const txt = await res.text();
        if (shouldSuggestRecovery(txt)) {
            markFailure(q, "web");
            appendMessage("ai", "Lumiere Live Web", txt + recoveryActionsHtml(), true);
        } else {
            appendMessage("ai", "Lumiere Live Web", txt, true);
        }

        const meta = parseAgentMetaFromHtml(txt);
        if (meta?.specialty) currentAgentSpecialty = meta.specialty;
        await Promise.all([
            refreshAgentStats(),
            refreshAgentMemory(),
            refreshMemoryFact()
        ]);
    } catch (err) {
        markFailure(q, "web");
        appendMessage("ai", "System", `Live web error: ${escapeHtml(err.message || "Request failed")}${recoveryActionsHtml()}`, true);
    } finally {
        setBusy(false);
        if (input) {
            input.value = "";
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
        container.innerHTML = "";
        agents.forEach((agent) => {
            const accuracy = Math.max(0, Math.min(100, Number(agent.accuracy || 0)));
            const level = Number(agent.level || 1);
            const token = agent.token || {};
            const rental = agent.rental || null;
            const listedText = token.listed ? `Listed @ ${fmtMaybe(token.list_price_sol)} SOL` : "Unlisted";
            const rentalText = rental ? `Rented by ${escapeHtml(rental.renter || "unknown")}` : "Not rented";
            const card = document.createElement("div");
            card.className = "agent-stat";
            card.innerHTML = `
                <div class="agent-head">
                    <div class="agent-name">${escapeHtml(agent.name)}</div>
                    <div class="agent-level ${levelBadgeClass(level)}">Lvl ${level}</div>
                </div>
                <div class="agent-bar"><span style="width:${accuracy.toFixed(1)}%"></span></div>
                <div class="agent-foot">${escapeHtml(agent.specialty)} · ${accuracy.toFixed(1)}% mastery</div>
                <div class="chain-strip">
                    <span>Mint: ${escapeHtml((token.mint_address || "").slice(0, 8) || "-")}...</span>
                    <span>Owner: ${escapeHtml(token.owner || "-")}</span>
                    <span>Holder: ${escapeHtml(token.holder || token.owner || "-")}</span>
                    <span>Value: ${fmtMaybe(token.value_score)}</span>
                    <span>${escapeHtml(listedText)}</span>
                    <span>${rentalText}</span>
                </div>
                <div class="chain-actions">
                    <button class="chain-action" data-action="mint" data-specialty="${escapeHtml(agent.specialty)}">Mint</button>
                    <button class="chain-action" data-action="list" data-specialty="${escapeHtml(agent.specialty)}">List</button>
                    <button class="chain-action" data-action="buy" data-specialty="${escapeHtml(agent.specialty)}">Buy</button>
                    <button class="chain-action" data-action="rent" data-specialty="${escapeHtml(agent.specialty)}">Rent</button>
                    <button class="chain-action" data-action="train" data-specialty="${escapeHtml(agent.specialty)}">Train</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (_) {}
}

async function chainAction(action, specialty) {
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
    if (!listEl || !eventsEl) return;
    try {
        const res = await fetch("/chain/marketplace");
        const data = await res.json();
        const listed = data.listed || [];
        const events = data.recent_events || [];

        if (!listed.length) {
            listEl.innerHTML = `<div class="agent-memory-empty">No listed agents right now.</div>`;
        } else {
            listEl.innerHTML = listed.map((item) => `
                <div class="market-item">
                    <div class="market-main">
                        <strong>${escapeHtml(item.agent_name || item.specialty)}</strong>
                        <span>${escapeHtml(item.specialty)} · ${escapeHtml(String(item.price_sol || "-"))} SOL</span>
                    </div>
                    <div class="market-sub">Owner: ${escapeHtml(item.owner || "-")} · Mint: ${escapeHtml((item.mint_address || "").slice(0, 8))}...</div>
                    <button class="chain-action" data-action="buy" data-specialty="${escapeHtml(item.specialty)}">Buy Listed</button>
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
                return `<div class="market-event"><span>${escapeHtml(ev.specialty || "-")}</span><span>${escapeHtml(summary)}</span></div>`;
            }).join("");
            eventsEl.innerHTML = `
                <div class="market-events-head">Recent Chain Events</div>
                ${rendered}
            `;
        }
    } catch (_) {}
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

async function refreshMemoryFact() {
    const footer = document.getElementById("remembers-footer");
    if (!footer) return;
    try {
        const requester = getActingAs();
        const res = await fetch(`/memory-fact?specialty=${encodeURIComponent(currentAgentSpecialty)}&requester=${encodeURIComponent(requester)}`);
        const data = await res.json();
        footer.textContent = `Lumiere remembers: ${data.fact || "..."}`;
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
        renderReminders(Array.isArray(items) ? items : []);
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

document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const savedTheme = localStorage.getItem("theme") || "system";
    const savedAccent = localStorage.getItem("accent") || body.dataset.accent || "#22d3ee";
    const currentModel = body.dataset.currentModel || "groq-llama3.3";

    applyTheme(savedTheme);
    setAccent(savedAccent);

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
    refreshUploadedContext();
    refreshMarketplace();
    setInterval(refreshAgentStats, 20000);
    setInterval(refreshMemoryFact, 24000);

    const input = document.getElementById("question");
    const sendBtn = document.getElementById("send-btn");
    const debateBtn = document.getElementById("debate-btn");
    const webBtn = document.getElementById("web-btn");
    const resetBtn = document.getElementById("avatar-reset-btn");
    const reminderAddBtn = document.getElementById("reminder-add-btn");
    const reminderInput = document.getElementById("reminder-input");
    const onboardingBanner = document.getElementById("onboarding-banner");
    const onboardingClose = document.getElementById("onboarding-close");
    const exportTxtBtn = document.getElementById("export-txt-btn");
    const exportJsonBtn = document.getElementById("export-json-btn");
    const uploadInput = document.getElementById("file-upload-input");
    const clearUploadedBtn = document.getElementById("clear-uploaded-btn");
    const ttsToggleBtn = document.getElementById("tts-toggle-btn");
    const actorInput = document.getElementById("actor-input");
    const actorApplyBtn = document.getElementById("actor-apply-btn");

    if (localStorage.getItem(ONBOARDING_KEY) === "1" && onboardingBanner) {
        onboardingBanner.style.display = "none";
    }
    if (onboardingClose) {
        onboardingClose.addEventListener("click", () => {
            localStorage.setItem(ONBOARDING_KEY, "1");
            if (onboardingBanner) onboardingBanner.style.display = "none";
        });
    }

    if (ttsToggleBtn) {
        ttsToggleBtn.addEventListener("click", () => setTtsEnabled(!isTtsEnabled()));
    }
    if (actorInput) actorInput.value = getActingAs();
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
            const files = Array.from(e.target.files || []);
            for (const f of files) {
                await uploadContextFile(f);
            }
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

    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
            }
        });
    }

    if (sendBtn) sendBtn.addEventListener("click", () => ask());
    if (debateBtn) debateBtn.addEventListener("click", () => askDebate());
    if (webBtn) webBtn.addEventListener("click", () => askLiveWeb());
    if (resetBtn) resetBtn.addEventListener("click", resetAvatar);
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
        chip.addEventListener("click", () => ask(chip.dataset.prompt || ""));
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

    const chatOutput = document.getElementById("chat-output");
    if (chatOutput) {
        chatOutput.addEventListener("click", async (e) => {
            const speakBtn = e.target.closest(".speak-btn");
            if (speakBtn) {
                const text = speakBtn.closest(".message")?.querySelector(".message-content")?.innerText || "";
                speakText(text);
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
            const agent = thumb.dataset.agent || "general";
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
                        agent
                    })
                });
                const data = await res.json();
                if (data.status === "ok") {
                    ratingBox?.classList.add("rated");
                    thumb.classList.add("selected");
                    toast("Feedback captured");
                    refreshAgentStats();
                } else {
                    toast("Feedback failed");
                }
            } catch (_) {
                toast("Feedback failed");
            }
        });
    }

    wireVoiceInput();

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((localStorage.getItem("theme") || "system") === "system") {
            applyTheme("system");
        }
    });
});
