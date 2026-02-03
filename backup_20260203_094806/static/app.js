console.log("[app.js] Loaded from static/app.js - beautiful version");

function setTheme(theme) {
    console.log("[app.js] setTheme:", theme);
    localStorage.setItem('theme', theme);
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.className = prefersDark ? 'theme-dark' : 'theme-light';
    } else {
        document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
    }
    fetch('/set-theme', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({theme})
    });
}

function setAccent(color) {
    console.log("[app.js] setAccent:", color);
    document.documentElement.style.setProperty('--accent', color);
    fetch('/set-accent', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accent: color})
    });
}

function ask() {
    console.log("[app.js] ask() called");
    const input = document.getElementById("question");
    const q = input.value.trim();
    if (!q) return;

    const output = document.getElementById("chat-output");
    const loading = document.getElementById("loading");

    output.innerHTML += '<div class="message user"><strong>You:</strong> ' + q + '</div>';
    loading.classList.add("active");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    fetch("/ask?q=" + encodeURIComponent(q), { signal: controller.signal })
        .then(res => {
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.text();
        })
        .then(txt => {
            loading.classList.remove("active");
            let cleaned = txt.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            output.innerHTML += '<div class="message ai"><strong>Lumiere:</strong> ' + cleaned + '</div>';
            output.scrollTop = output.scrollHeight;
        })
        .catch(err => {
            clearTimeout(timeoutId);
            loading.classList.remove("active");
            console.error("[app.js] Fetch error:", err);
            let errorMsg = err.name === 'AbortError' ? 'Request timed out (30s)' : err.message;
            output.innerHTML += '<div class="message ai" style="color:#dc2626;">Error: ' + errorMsg + '</div>';
            output.scrollTop = output.scrollHeight;
        });

    input.value = "";
    input.focus();
}

function rate(messageId, value) {
    console.log("[app.js] rate:", value, "for message", messageId);
    fetch("/rate", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message_id: messageId, value: value})
    })
    .then(res => res.json())
    .then(data => console.log("[app.js] Rating saved:", data))
    .catch(err => console.error("[app.js] Rating error:", err));
}

// Main setup
document.addEventListener('DOMContentLoaded', function() {
    console.log("[app.js] DOMContentLoaded - attaching listeners");

    const questionInput = document.getElementById("question");
    const sendBtn = document.getElementById("send-btn");
    const chatOutput = document.getElementById("chat-output");

    if (questionInput) {
        questionInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                console.log("[app.js] Enter pressed");
                e.preventDefault();
                ask();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener("click", function() {
            console.log("[app.js] Send clicked");
            ask();
        });
    }

    // Event delegation for rating buttons
    if (chatOutput) {
        chatOutput.addEventListener("click", function(e) {
            const button = e.target.closest(".rate-btn");
            if (!button) return;

            const messageId = button.dataset.messageId;
            const value = parseInt(button.dataset.value);

            // Visual feedback
            button.style.transform = "scale(1.8)";
            setTimeout(() => button.style.transform = "scale(1)", 250);

            rate(messageId, value);
        });
    }

    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
});