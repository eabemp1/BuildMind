# main.py - Lumiere: Persistent, Ownable AI Companion

from agents import EvolvAIAgent
from memory import save_squad, load_squad
from groq import Groq
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

load_dotenv()  # Load .env file (GROQ_API_KEY)

app = FastAPI(title="Lumiere - Your AI Companion")

# === User Profile (Name) ===
USER_PROFILE_FILE = "user_profile.json"

def load_user_name():
    if os.path.exists(USER_PROFILE_FILE):
        with open(USER_PROFILE_FILE, 'r') as f:
            data = json.load(f)
            return data.get("name")
    return None

def save_user_name(name):
    with open(USER_PROFILE_FILE, 'w') as f:
        json.dump({"name": name.strip()}, f)

user_name = load_user_name()

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
            completion = client.chat.completions.create(
                model=config["model"],
                messages=[
                    {"role": "system", "content": "You are a helpful classifier. Answer with one word or phrase only (e.g., farming, medicine, cooking, science)."},
                    {"role": "user", "content": f"What specialty does this question need? {question}"}
                ],
                temperature=0.3,
                max_tokens=20,
            )
            return completion.choices[0].message.content.strip().lower()
        except Exception as e:
            return f"Error: {str(e)}"

    return "Provider not implemented."

# Global squad
squad = load_squad()

@app.on_event("startup")
async def startup_event():
    global squad
    squad = load_squad()
    print("Squad loaded from squad_memory.json" if squad else "No previous squad found.")

# Welcome / Name Input Page
@app.get("/", response_class=HTMLResponse)
async def home():
    if user_name:
        # User already has name → show main page
        return await main_page()
    else:
        # Show name input page
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
                    font-weight:bold; 
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

@app.post("/set-name")
async def set_name(name: str = Form(...)):
    global user_name
    user_name = name.strip()
    save_user_name(user_name)
    return RedirectResponse(url="/", status_code=303)

@app.get("/main", response_class=HTMLResponse)
async def main_page():
    global squad

    agents_html = ""
    if not squad:
        agents_html = "<p style='color:#666; font-style:italic;'>No agents yet — ask questions to help Lumiere grow!</p>"
    else:
        for agent in squad:
            agents_html += f"""
            <div style="border:1px solid #e0e0e0; padding:16px; margin:12px 0; border-radius:10px; background:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:1.1em; color:#1a3c34;">{agent.name}</strong>
                    <span style="font-size:0.9em; color:#555;">{agent.__class__.__name__}</span>
                </div>
                <div style="margin-top:8px; font-size:0.95em;">
                    <span style="color:#2e7d32; font-weight:bold;">Accuracy: {agent.accuracy:.1f}%</span>  
                    <span style="margin-left:12px; color:#c62828;">Grade: {agent.grade}</span>
                </div>
                <div style="margin-top:6px; font-size:0.85em; color:#555;">
                    Specialty: {getattr(agent, 'specialty', 'General')}
                </div>
            </div>
            """

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lumiere — Your Companion</title>
        <style>
            body {{ 
                font-family: 'Segoe UI', system-ui, sans-serif; 
                margin:0; 
                padding:0; 
                background: linear-gradient(135deg, #f5f7fa 0%, #e4e9fd 100%); 
                min-height:100vh; 
                color:#1a1a1a; 
            }}
            .header {{ 
                background: linear-gradient(90deg, #1e3a8a, #3b82f6); 
                color:white; 
                text-align:center; 
                padding:2.5rem 1rem; 
                box-shadow:0 4px 12px rgba(0,0,0,0.15); 
            }}
            .header h1 {{ margin:0; font-size:2.4rem; }}
            .header p {{ margin:8px 0 0; opacity:0.9; }}
            .container {{ 
                max-width:1280px; 
                margin:40px auto; 
                padding:0 20px; 
                display:flex; 
                gap:32px; 
                flex-wrap:wrap; 
            }}
            .panel {{ 
                flex:1; 
                min-width:340px; 
                background:white; 
                border-radius:16px; 
                box-shadow:0 8px 30px rgba(0,0,0,0.08); 
                overflow:hidden; 
            }}
            .panel-header {{ 
                background:#f8fafc; 
                padding:18px 24px; 
                border-bottom:1px solid #e5e7eb; 
                font-weight:600; 
                font-size:1.25rem; 
                color:#1e40af; 
            }}
            .panel-body {{ padding:24px; }}
            .chat-messages {{ 
                min-height:320px; 
                max-height:600px; 
                overflow-y:auto; 
                padding:16px; 
                background:#f9fafb; 
                border-radius:10px; 
                margin-bottom:16px; 
            }}
            .message {{ 
                margin:12px 0; 
                padding:14px 18px; 
                border-radius:12px; 
                line-height:1.5; 
            }}
            .user {{ 
                background:#dbeafe; 
                align-self:flex-start; 
                margin-right:20%; 
            }}
            .ai {{ 
                background:#e0f2fe; 
                align-self:flex-end; 
                margin-left:20%; 
                color:#0f172a; 
            }}
            .input-area {{ display:flex; gap:12px; }}
            input {{ 
                flex:1; 
                padding:14px 18px; 
                border:1px solid #d1d5db; 
                border-radius:10px; 
                font-size:1rem; 
            }}
            button {{ 
                padding:14px 28px; 
                background:#3b82f6; 
                color:white; 
                border:none; 
                border-radius:10px; 
                font-weight:600; 
                cursor:pointer; 
                transition:0.2s; 
            }}
            button:hover {{ background:#2563eb; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Lumiere</h1>
            <p>{user_name}'s personal, evolving AI companion</p>
        </div>

        <div class="container">
            <div class="panel">
                <div class="panel-header">Your Agents</div>
                <div class="panel-body">
                    {agents_html}
                </div>
            </div>

            <div class="panel">
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
        # Route to best agent
        best_agent = None
        question_lower = q.lower()
        for agent in squad:
            agent_type = agent.__class__.__name__.lower()
            role = getattr(agent, 'role', '').lower()
            if any(word in question_lower for word in ["farm", "crop", "plant", "soil", "maize", "yam"]):
                if "farmer" in agent_type or "farm" in role:
                    best_agent = agent
                    break
            elif any(word in question_lower for word in ["teach", "learn", "study", "exam", "math", "lesson"]):
                if "tutor" in agent_type or "teach" in role:
                    best_agent = agent
                    break

        # Fallback to highest accuracy agent
        if not best_agent and squad:
            best_agent = max(squad, key=lambda a: a.accuracy)

        agent_name = best_agent.name if best_agent else "Lumiere"
        agent_accuracy = best_agent.accuracy if best_agent else 50.0

        # Build prompt with agent context
        prompt = f"You are Lumiere's {agent_name} with {agent_accuracy:.1f}% mastery. Answer accurately and helpfully: {q}"

        answer = ask_llm(prompt)

        return f"[{agent_name}]: {answer}"
    except Exception as e:
        return f"Error: {str(e)}"

# Run the web server
if __name__ == "__main__":
    print("Starting Lumiere web interface...")
    print("Open your browser to: http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)