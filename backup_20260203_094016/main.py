# main.py - Lumiere (stable, static files, ratings, agents, line breaks)

from groq import Groq
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

load_dotenv()

app = FastAPI(title="Lumiere")

# Mount static folder – must be right here
app.mount("/static", StaticFiles(directory="static"), name="static")

# === Profile ===
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

# === LLM ===
MODELS = {
    "groq-llama3.3": {
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "api_key": os.getenv("GROQ_API_KEY")
    }
}

def ask_llm(question):
    config = MODELS["groq-llama3.3"]
    if not config["api_key"]:
        return "Error: GROQ_API_KEY missing"

    client = Groq(api_key=config["api_key"])
    try:
        system_prompt = f"You are Lumiere, personal companion of {user_name or 'friend'}. Warm, casual tone. Start with 'Yh, {user_name or 'friend'}'. Helpful, encouraging. No Markdown."
        completion = client.chat.completions.create(
            model=config["model"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question}
            ],
            temperature=0.75,
            max_tokens=600,
        )
        answer = completion.choices[0].message.content.strip()
        return answer
    except Exception as e:
        return f"Groq error: {str(e)}"

# === Agents ===
class Agent:
    def __init__(self, name, specialty, accuracy=50.0):
        self.name = name
        self.specialty = specialty
        self.accuracy = accuracy

squad = [
    Agent("Math Expert", "math"),
    Agent("Finance Guide", "finance"),
    Agent("Cooking Buddy", "cooking"),
    Agent("Reminder Manager", "reminders"),
    Agent("General Companion", "general")
]

@app.get("/", response_class=HTMLResponse)
async def home():
    if not user_name:
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Lumiere</title>
            <style>
                body { margin:0; height:100vh; background: linear-gradient(135deg, #667eea, #764ba2); display:flex; justify-content:center; align-items:center; font-family: 'Segoe UI', sans-serif; color:white; }
                .card { background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); padding:3rem 2.5rem; border-radius:20px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.37); border:1px solid rgba(255,255,255,0.18); max-width:450px; width:90%; }
                h1 { font-size:2.8rem; margin-bottom:1.5rem; }
                p { font-size:1.2rem; margin-bottom:2rem; opacity:0.9; }
                input { width:100%; padding:14px; font-size:1.1rem; border:none; border-radius:10px; margin-bottom:1.5rem; }
                button { padding:14px 40px; font-size:1.1rem; background:#fff; color:#4c1d95; border:none; border-radius:10px; cursor:pointer; }
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

    html = """
    <!DOCTYPE html>
    <html lang="en" class="THEME_CLASS">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lumiere — Your Companion</title>
        <link rel="stylesheet" href="/static/app.css">
        <script src="/static/app.js" defer></script>
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
            <p>USER_NAME's personal, evolving AI companion</p>
        </div>

        <div class="container">
            <div class="chat-panel">
                <div class="panel-header">Talk to Lumiere</div>
                <div class="panel-body">
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
                        <input id="question" type="text" placeholder="Ask me anything, USER_NAME..." autocomplete="off">
                        <button id="send-btn">Send</button>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    html = html.replace("THEME_CLASS", 'theme-dark' if theme == 'dark' else 'theme-light')
    html = html.replace("USER_NAME", user_name or "friend")

    return html

@app.get("/ask")
async def ask(q: str):
    print(f"[server] /ask hit with q: {q}")
    if not q:
        print("[server] No question")
        return "Please ask a question."

    try:
        q_lower = q.lower()
        specialty = "general"

        if any(w in q_lower for w in ["math", "equation", "calculus", "derivative", "algebra"]):
            specialty = "math"
        elif any(w in q_lower for w in ["finance", "stock", "trade", "invest", "money"]):
            specialty = "finance"
        elif any(w in q_lower for w in ["cook", "recipe", "food", "meal", "bake"]):
            specialty = "cooking"
        elif any(w in q_lower for w in ["remind", "reminder", "task", "schedule", "alert"]):
            specialty = "reminders"

        agent = next((a for a in squad if a.specialty == specialty), None)
        if not agent:
            if specialty == "math":
                agent = Agent("Math Expert", "math")
            elif specialty == "finance":
                agent = Agent("Finance Guide", "finance")
            elif specialty == "cooking":
                agent = Agent("Cooking Buddy", "cooking")
            elif specialty == "reminders":
                agent = Agent("Reminder Manager", "reminders")
            else:
                agent = Agent("General Companion", "general")
            squad.append(agent)
            print(f"[server] New agent: {agent.name}")

        prompt = f"You are {agent.name} ({agent.specialty}), {agent.accuracy:.1f}% mastery. Answer: {q}"
        print(f"[server] Prompt ready")
        answer = ask_llm(prompt)
        print(f"[server] LLM answer received (len: {len(answer)})")

        answer = answer.replace("\n", "<br>")

        message_id = str(hash(q))
        answer += f"""
        <div class="rating-buttons">
            Rate this answer:
            <button class="rate-btn" data-message-id="{message_id}" data-value="1">👍</button>
            <button class="rate-btn" data-message-id="{message_id}" data-value="-1">👎</button>
        </div>
        """

        return answer
    except Exception as e:
        print(f"[server] /ask ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Server error: {str(e)}"

@app.post("/rate")
async def rate(message_id: str, value: int):
    print(f"Rating received: {value} for message {message_id}")
    for agent in squad:
        agent.accuracy = min(100, max(0, agent.accuracy + value * 5))
        print(f"Updated {agent.name} accuracy to {agent.accuracy:.1f}%")
    return {"status": "ok"}

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

if __name__ == "__main__":
    print("Starting Lumiere...")
    print("Open: http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)