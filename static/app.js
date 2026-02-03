// app.js - IMPROVED with better error handling and live agent stats

console.log("[app.js] Loaded - Enhanced version with agent stats support");

// Theme management
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
    }).catch(err => console.error("[app.js] Theme save error:", err));
}

// Accent color management
function setAccent(color) {
    console.log("[app.js] setAccent:", color);
    document.documentElement.style.setProperty('--accent', color);
    
    fetch('/set-accent', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accent: color})
    }).catch(err => console.error("[app.js] Accent save error:", err));
}

// Main ask function
function ask() {
    console.log("[app.js] ask() called");
    const input = document.getElementById("question");
    const q = input.value.trim();
    
    if (!q) {
        console.log("[app.js] Empty question, ignoring");
        return;
    }

    const output = document.getElementById("chat-output");
    const loading = document.getElementById("loading");

    // Add user message
    output.innerHTML += '<div class="message user"><strong>You:</strong> ' + escapeHtml(q) + '</div>';
    
    // Show loading
    loading.classList.add("active");
    
    // Scroll to bottom
    output.scrollTop = output.scrollHeight;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // Make request
    fetch("/ask?q=" + encodeURIComponent(q), { signal: controller.signal })
        .then(res => {
            clearTimeout(timeoutId);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.text();
        })
        .then(txt => {
            console.log("[app.js] Response received (length: " + txt.length + ")");
            loading.classList.remove("active");
            
            // Clean up response (handle line breaks)
            let cleaned = txt.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            
            // Add AI message
            output.innerHTML += '<div class="message ai"><strong>Lumiere:</strong> ' + cleaned + '</div>';
            
            // Scroll to bottom
            output.scrollTop = output.scrollHeight;
            
            // Refresh agent stats (in case they were updated)
            refreshAgentStats();
        })
        .catch(err => {
            clearTimeout(timeoutId);
            loading.classList.remove("active");
            console.error("[app.js] Fetch error:", err);
            
            let errorMsg = err.name === 'AbortError' 
                ? 'Request timed out (30s). The server might be slow or unresponsive.' 
                : 'Error: ' + err.message;
            
            output.innerHTML += '<div class="message ai" style="color:#dc2626;"><strong>Error:</strong> ' + errorMsg + '</div>';
            output.scrollTop = output.scrollHeight;
        });

    // Clear input and refocus
    input.value = "";
    input.focus();
}

// Rating function
function rate(messageId, value) {
    console.log("[app.js] rate:", value, "for message", messageId);
    
    fetch("/rate", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            message_id: messageId, 
            value: value
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("[app.js] Rating saved:", data);
        
        if (data.status === "ok") {
            console.log(`[app.js] ${data.agent} updated: ${data.old_accuracy}% → ${data.new_accuracy}%`);
            
            // Refresh agent stats to show update
            refreshAgentStats();
            
            // Optional: Show brief success message
            showToast(`${data.agent} updated to ${data.new_accuracy.toFixed(1)}%`);
        }
    })
    .catch(err => console.error("[app.js] Rating error:", err));
}

// Refresh agent stats from server
function refreshAgentStats() {
    fetch("/agent-stats")
        .then(res => res.json())
        .then(data => {
            console.log("[app.js] Agent stats refreshed:", data.agents.length, "agents");
            updateAgentStatsDisplay(data.agents);
        })
        .catch(err => console.error("[app.js] Agent stats refresh error:", err));
}

// Update agent stats display in the sidebar
function updateAgentStatsDisplay(agents) {
    const statsContainer = document.querySelector('.agent-stats');
    if (!statsContainer) {
        console.log("[app.js] No agent-stats container found, skipping update");
        return;
    }
    
    // Rebuild stats HTML
    statsContainer.innerHTML = agents.map(agent => 
        `<div class="agent-stat">${agent.name}: ${agent.accuracy.toFixed(1)}% mastery</div>`
    ).join('');
    
    console.log("[app.js] Agent stats display updated");
}

// Show brief toast notification
function showToast(message) {
    // Check if toast container exists, if not create it
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        `;
        document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: var(--panel-bg);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: 12px;
        border: 1px solid var(--panel-border);
        box-shadow: 0 4px 20px var(--shadow);
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease-out;
    `;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Main setup - runs when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("[app.js] DOMContentLoaded - initializing");

    // Get elements
    const questionInput = document.getElementById("question");
    const sendBtn = document.getElementById("send-btn");
    const chatOutput = document.getElementById("chat-output");

    // Setup enter key handler
    if (questionInput) {
        questionInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                console.log("[app.js] Enter pressed");
                e.preventDefault();
                ask();
            }
        });
        console.log("[app.js] Enter key handler attached");
    }

    // Setup send button handler
    if (sendBtn) {
        sendBtn.addEventListener("click", function() {
            console.log("[app.js] Send button clicked");
            ask();
        });
        console.log("[app.js] Send button handler attached");
    }

    // Setup event delegation for rating buttons
    if (chatOutput) {
        chatOutput.addEventListener("click", function(e) {
            const button = e.target.closest(".rate-btn");
            if (!button) return;

            const messageId = button.dataset.messageId;
            const value = parseInt(button.dataset.value);

            // Visual feedback
            button.style.transform = "scale(1.8)";
            setTimeout(() => button.style.transform = "scale(1)", 250);

            // Send rating
            rate(messageId, value);
        });
        console.log("[app.js] Rating button handler attached");
    }

    // Restore saved theme
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
    console.log("[app.js] Theme restored:", savedTheme);

    // Optional: Refresh agent stats every 30 seconds
    setInterval(refreshAgentStats, 30000);

    console.log("[app.js] Initialization complete!");
});

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
