# main.py - Lumiere: Persistent, Ownable AI Companion

from agents import EvolvAIAgent
from memory import save_squad, load_squad
from groq import Groq
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
import uvicorn

load_dotenv()  # Load .env file (GROQ_API_KEY)

app = FastAPI(title="Lumiere - Your AI Companion")

# === User Profile (Name + Theme + Accent) ===
USER_PROFILE_FILE = "user_profile.json"

def load_user_profile():
    if os.path.exists(USER_PROFILE_FILE):
        with open(USER_PROFILE_FILE, 'r') as f:
            return json.load(f)
    return {"name": None, "theme": "system", "accent": "#3b82f6"}

def save_user_profile(profile):
    with open(USER_PROFILE_FILE, 'w') as f:
        json.dump(profile, f, indent=2)

profile = load_user_profile()
user_name = profile.get("name")
theme = profile.get("theme", "system")
accent_color = profile.get("accent", "#3b82f6")

# === LLM Configuration ===
MODELS = {
    "groq-llama3.3": {
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "api_key": os.getenv("GROQ_API_KEY")
    }
}

def ask_llm(question, model_key="groq-llama3.3"):
    config = MODELS.get(model_key)
    if not config:
        return f"Error: Model key '{model_key}' not found."

    if config["provider"] == "groq":
        api_key = config["api_key"]
        if not api_key:
            return "Error: GROQ_API_KEY not set."

        client = Groq(api_key=api_key)
        try:
            system_prompt = (
                f"You are Lumiere, the personal, persistent AI companion of {user_name or 'friend'}. "
                f"Always speak directly to {user_name or 'friend'} in a warm, casual, supportive tone. "
                f"Start with 'Yh, {user_name or 'friend'}' or similar. Be helpful and encouraging. No Markdown."
            )

            completion = client.chat.completions.create(
                model=config["model"],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}
                ],
                temperature=0.75,
                max_tokens=600,
            )
            raw_answer = completion.choices[0].message.content
            clean_answer = raw_answer.replace("**", "").replace("*", "").replace("__", "").replace("_", "")
            return clean_answer.strip()
        except Exception as e:
            return f"Groq error: {str(e)}"

    return "Model not implemented yet."

# Global squad (loaded on startup, but never shown in UI)
squad = None

@app.on_event("startup")
async def startup_event():
    global squad
    squad = load_squad()
    print("Squad loaded from squad_memory.json" if squad else "No previous squad found.")

@app.get("/", response_class=HTMLResponse)
async def home():
    if not user_name:
        # Welcome page if no name
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Lumiere</title>
            <style>
                body { 
                    margin:0; 
                    height:100vh; 
                    background: linear-gradient(135deg, #667eea, #764ba2); 
                    display:flex; 
                    justify-content:center; 
                    align-items:center; 
                    font-family: 'Segoe UI', sans-serif; 
                    color:white; 
                }
                .card { 
                    background:rgba(255,255,255,0.15); 
                    backdrop-filter:blur(10px); 
                    padding:3rem 2.5rem; 
                    border-radius:20px; 
                    text-align:center; 
                    box-shadow:0 8px 32px rgba(0,0,0,0.37); 
                    border:1px solid rgba(255,255,255,0.18); 
                    max-width:450px; 
                    width:90%; 
                }
                h1 { font-size:2.8rem; margin-bottom:1.5rem; }
                p { font-size:1.2rem; margin-bottom:2rem; opacity:0.9; }
                input { 
                    width:100%; 
                    padding:14px; 
                    font-size:1.1rem; 
                    border:none; 
                    border-radius:10px; 
                    margin-bottom:1.5rem; 
                }
                button { 
                    padding:14px 40px; 
                    font-size:1.1rem; 
                    background:#fff; 
                    color:#4c1d95; 
                    border:none; 
                    border-radius:10px; 
                    cursor:pointer; 
                }
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

    # Main chat page (no agents panel)
    return f"""
    <!DOCTYPE html>
    <html lang="en" class="{ 'theme-dark' if theme == 'dark' else '' }">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lumiere — Your Companion</title>
        <style>
            :root {{
                --bg-primary: #0d1117;
                --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                --bg-secondary: #1e293b;
                --text-primary: #e2e8f0;
                --text-secondary: #94a3b8;
                --accent: {accent_color};
                --panel-bg: rgba(30, 41, 59, 0.6);
                --panel-border: rgba(148, 163, 184, 0.2);
                --shadow: rgba(0, 0, 0, 0.6);
                --glow: rgba(59, 130, 246, 0.2);
            }}
            .theme-light {{
                --bg-primary: #f8fafc;
                --bg-gradient: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
                --bg-secondary: #ffffff;
                --text-primary: #0f172a;
                --text-secondary: #475569;
                --panel-bg: rgba(255, 255, 255, 0.85);
                --panel-border: rgba(203, 213, 225, 0.6);
                --shadow: rgba(0, 0, 0, 0.1);
                --glow: rgba(59, 130, 246, 0.15);
            }}
            body {{ 
                font-family: 'Segoe UI', system-ui, sans-serif; 
                margin:0; 
                padding:0; 
                background: var(--bg-gradient); 
                min-height:100vh; 
                color:var(--text-primary); 
                transition: all 0.4s ease;
            }}
            .header {{ 
                background: rgba(15, 23, 42, 0.7); 
                backdrop-filter: blur(12px); 
                color:var(--text-primary); 
                text-align:center; 
                padding:2rem 1rem; 
                box-shadow:0 4px 20px var(--shadow); 
                border-bottom:1px solid var(--panel-border); 
            }}
            .theme-light .header {{ background: rgba(255, 255, 255, 0.85); }}
            .header h1 {{ margin:0; font-size:2.8rem; background: linear-gradient(90deg, var(--accent), #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
            .header p {{ margin:8px 0 0; opacity:0.9; font-size:1.1rem; }}
            .container {{ 
                max-width:1000px; 
                margin:40px auto; 
                padding:0 20px; 
            }}
            .chat-panel {{ 
                background:var(--panel-bg); 
                backdrop-filter:blur(12px); 
                border-radius:20px; 
                box-shadow:0 10px 40px var(--shadow); 
                border:1px solid var(--panel-border); 
                overflow:hidden; 
            }}
            .panel-header {{ 
                background:rgba(30, 41, 59, 0.6); 
                padding:1.2rem 2rem; 
                border-bottom:1px solid var(--panel-border); 
                font-weight:600; 
                font-size:1.4rem; 
                color:var(--accent); 
                text-align:center; 
            }}
            .theme-light .panel-header {{ background:rgba(255, 255, 255, 0.6); }}
            .chat-messages {{ 
                min-height:500px; 
                max-height:80vh; 
                overflow-y:auto; 
                padding:2rem; 
            }}
            .message {{ 
                margin:1.5rem 0; 
                padding:1.2rem 1.5rem; 
                border-radius:16px; 
                line-height:1.6; 
                max-width:85%; 
                word-wrap:break-word; 
            }}
            .user {{ 
                background:var(--accent); 
                color:white; 
                margin-left:auto; 
                border-bottom-right-radius:4px; 
            }}
            .ai {{ 
                background:var(--bg-secondary); 
                color:var(--text-primary); 
                margin-right:auto; 
                border-bottom-left-radius:4px; 
            }}
            .input-area {{ 
                display:flex; 
                gap:12px; 
                padding:1.5rem 2rem; 
                border-top:1px solid var(--panel-border); 
                background:var(--panel-bg); 
            }}
            input {{ 
                flex:1; 
                padding:14px 18px; 
                border:1px solid var(--panel-border); 
                border-radius:12px; 
                font-size:1rem; 
                background:var(--bg-secondary); 
                color:var(--text-primary); 
            }}
            button {{ 
                padding:14px 28px; 
                background:var(--accent); 
                color:white; 
                border:none; 
                border-radius:12px; 
                font-weight:600; 
                cursor:pointer; 
                transition: all 0.2s; 
            }}
            button:hover {{ background:#2563eb; transform:translateY(-1px); }}
            .theme-switcher {{ 
                position:fixed; 
                top:1rem; 
                right:1rem; 
                display:flex; 
                gap:8px; 
                z-index:1000; 
            }}
            .theme-switcher button, .theme-switcher select {{ 
                padding:8px 16px; 
                background:rgba(255,255,255,0.15); 
                border:1px solid rgba(255,255,255,0.2); 
                border-radius:8px; 
                color:white; 
                cursor:pointer; 
            }}
            .theme-light .theme-switcher button, .theme-light .theme-switcher select {{ 
                background:rgba(0,0,0,0.05); 
                border:1px solid rgba(0,0,0,0.1); 
                color:#1a1a1a; 
            }}
        </style>
    </head>
    <body>
        <div class="theme-switcher">
            <button onclick="setTheme('light')">☀️ Light</button>
            <button onclick="setTheme('dark')">🌙 Dark</button>
            <button onclick="setTheme('system')">⚙️ System</button>
            <select onchange="setAccent(this.value)">
                <option value="#3b82f6">Blue</option>
                <option value="#10b981">Green</option>
                <option value="#a855f7">Purple</option>
                <option value="#f59e0b">Gold</option>
            </select>
        </div>

        <div class="header">
            <h1>Lumiere</h1>
            <p>{user_name}'s personal, evolving AI companion</p>
        </div>

        <div class="container">
            <div class="chat-panel">
                <div class="panel-header">Talk to Lumiere</div>
                <div class="panel-body">
                    <div id="chat-output" class="chat-messages"></div>
                    <div class="input-area">
                        <input id="question" type="text" placeholder="Ask me anything, {user_name}..." autocomplete="off">
                        <button onclick="ask()">Send</button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            function setTheme(theme) {{
                localStorage.setItem('theme', theme);
                if (theme === 'system') {{
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    document.documentElement.className = prefersDark ? 'theme-dark' : 'theme-light';
                }} else {{
                    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
                }}
                fetch('/set-theme', {{
                    method: 'POST',
                    headers: {{'Content-Type': 'application/json'}},
                    body: JSON.stringify({{theme: theme}})
                }});
            }}

            function setAccent(color) {{
                document.documentElement.style.setProperty('--accent', color);
                fetch('/set-accent', {{
                    method: 'POST',
                    headers: {{'Content-Type': 'application/json'}},
                    body: JSON.stringify({{accent: color}})
                }});
            }}

            // Load saved theme
            const savedTheme = localStorage.getItem('theme') || 'system';
            setTheme(savedTheme);

            async function ask() {{
                const input = document.getElementById("question");
                const q = input.value.trim();
                if (!q) return;

                const output = document.getElementById("chat-output");
                output.innerHTML += '<div class="message user"><strong>You:</strong> ' + q + '</div>';

                try {{
                    const res = await fetch("/ask?q=" + encodeURIComponent(q));
                    const txt = await res.text();
                    output.innerHTML += '<div class="message ai"><strong>Lumiere:</strong> ' + txt.replace(/\\n/g, '<br>') + '</div>';
                }} catch (err) {{
                    output.innerHTML += '<div class="message ai" style="color:#dc2626;">Error: ' + err.message + '</div>';
                }}

                output.scrollTop = output.scrollHeight;
                input.value = "";
                input.focus();
            }}

            document.getElementById("question").addEventListener("keypress", function(e) {{
                if (e.key === "Enter") ask();
            }});
        </script>
    </body>
    </html>
    """

@app.get("/ask")
async def ask(q: str):
    if not q:
        return "Please ask a question."
    try:
        answer = ask_llm(q)
        return answer
    except Exception as e:
        return f"Error: {str(e)}"

@app.post("/set-theme")
async def set_theme(data: dict):
    global theme
    theme = data.get("theme", "system")
    profile = load_user_profile()
    profile["theme"] = theme
    save_user_profile(profile)
    return {"status": "ok"}

@app.post("/set-accent")
async def set_accent(data: dict):
    global accent_color
    accent_color = data.get("accent", "#3b82f6")
    profile = load_user_profile()
    profile["accent"] = accent_color
    save_user_profile(profile)
    return {"status": "ok"}

@app.post("/set-name")
async def set_name(name: str = Form(...)):
    global user_name
    user_name = name.strip()
    profile = load_user_profile()
    profile["name"] = user_name
    save_user_profile(profile)
    return RedirectResponse(url="/", status_code=303)

# Run the web server
if __name__ == "__main__":
    print("Starting Lumiere web interface...")
    print("Open your browser to: http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)