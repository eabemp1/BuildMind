console.log("[app.js] Script loaded from static file");

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
    }).then(() => console.log("Theme saved")).catch(err => console.error("Theme error:", err));
}

function setAccent(color) {
    console.log("[app.js] setAccent:", color);
    document.documentElement.style.setProperty('--accent', color);
    fetch('/set-accent', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accent: color})
    }).then(() => console.log("Accent saved")).catch(err => console.error("Accent error:", err));
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

    fetch("/ask?q=" + encodeURIComponent(q))
        .then(res => res.text())
        .then(txt => {
            loading.classList.remove("active");
            let cleaned = txt.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            output.innerHTML += '<div class="message ai"><strong>Lumiere:</strong> ' + cleaned + '</div>';
            output.scrollTop = output.scrollHeight;
        })
        .catch(err => {
            loading.classList.remove("active");
            output.innerHTML += '<div class="message ai" style="color:#dc2626;">Error: ' + err.message + '</div>';
            output.scrollTop = output.scrollHeight;
        });

    input.value = "";
    input.focus();
}

function rate(messageId, value) {
    console.log("[app.js] rate:", value, "for", messageId);
    fetch("/rate", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message_id: messageId, value: value})
    })
    .then(res => res.json())
    .then(data => console.log("Rating saved:", data))
    .catch(err => console.error("Rating error:", err));
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("[app.js] DOMContentLoaded fired - attaching listeners");

    const questionInput = document.getElementById("question");
    const sendBtn = document.getElementById("send-btn");

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

    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
});