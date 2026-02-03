# main.py - Lumiere FIXED VERSION
# Changes: Integrated specialized agents, connected memory system, fixed rating

from groq import Groq
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Body
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# Import our specialized agents and memory system
from agents import EvolvAIAgent, MathAgent, FinanceAgent, CookingAgent, ReminderAgent
from memory import save_squad, load_squad

load_dotenv()

app = FastAPI(title="Lumiere")

# Mount static folder
app.mount("/static", StaticFiles(directory="static"), name="static")

# === Profile ===
USER_PROFILE_FILE = "user_profile.json"

def load_user_profile():
    """Load user profile from JSON file"""
    if os.path.exists(USER_PROFILE_FILE):
        with open(USER_PROFILE_FILE, 'r') as f:
            return json.load(f)
    return {"name": None, "theme": "system", "accent": "#3b82f6"}

def save_user_profile(profile):
    """Save user profile to JSON file"""
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

def ask_llm(question, agent_name="Lumiere", specialty="general", accuracy=50.0):
    """
    Ask the LLM with agent-specific context
    
    Args:
        question: User's question
        agent_name: Which agent is responding
        specialty: Agent's specialty area
        accuracy: Agent's current mastery level
    
    Returns:
        str: LLM response
    """
    config = MODELS["groq-llama3.3"]
    if not config["api_key"]:
        return "Error: GROQ_API_KEY missing. Add it to your .env file"

    client = Groq(api_key=config["api_key"])
    try:
        # Build dynamic system prompt based on agent
        system_prompt = f"""You are {agent_name}, a specialized AI agent ({specialty}) with {accuracy:.1f}% mastery.
You're assisting {user_name or 'a friend'}.
- Be warm, casual, and encouraging
- Start responses with 'Yh, {user_name or 'friend'}'
- For {specialty} questions, show your expertise
- No Markdown formatting - use plain text with line breaks
- Keep responses concise but helpful"""

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
        return f"Groq API error: {str(e)}"

# === Agent Squad ===
# Load squad from memory, or create fresh if none exists
squad = load_squad()
if not squad:
    print("Creating fresh squad...")
    squad = [
        MathAgent(),
        FinanceAgent(),
        CookingAgent(),
        ReminderAgent(),
        EvolvAIAgent("General Companion", 50.0)
    ]
    save_squad(squad)

print(f"Squad loaded: {[agent.name for agent in squad]}")

# Track which agent answered each message (for accurate rating)
message_to_agent = {}

def route_to_agent(question):
    """
    Route question to the most appropriate specialized agent
    
    Args:
        question: User's question
    
    Returns:
        EvolvAIAgent: The best agent for this question
    """
    q_lower = question.lower()
    
    # Match keywords to specialties
    if any(word in q_lower for word in ["math", "equation", "calculus", "derivative", "algebra", "geometry", "trigonometry", "statistics"]):
        return next((a for a in squad if a.specialty == "math"), squad[0])
    
    elif any(word in q_lower for word in ["finance", "stock", "trade", "invest", "money", "budget", "crypto", "portfolio"]):
        return next((a for a in squad if a.specialty == "finance"), squad[0])
    
    elif any(word in q_lower for word in ["cook", "recipe", "food", "meal", "bake", "ingredient", "kitchen"]):
        return next((a for a in squad if a.specialty == "cooking"), squad[0])
    
    elif any(word in q_lower for word in ["remind", "reminder", "task", "schedule", "alert", "todo", "calendar"]):
        return next((a for a in squad if a.specialty == "reminders"), squad[0])
    
    else:
        # Default to general companion
        return next((a for a in squad if a.specialty == "general"), squad[0])

@app.get("/", response_class=HTMLResponse)
async def home():
    """Main page - shows welcome screen or chat interface"""
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
                input { width:100%; padding:14px; font-size:1.1rem; border:none; border-radius:10px; margin-bottom:1.5rem; box-sizing:border-box; }
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

    # Build agent stats for display
    agent_stats = ""
    for agent in squad:
        agent_stats += f'<div class="agent-stat">{agent.name}: {agent.accuracy:.1f}% mastery</div>\n'

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
            <div class="agent-panel">
                <div class="panel-header">Agent Squad</div>
                <div class="agent-stats">
                    AGENT_STATS
                </div>
            </div>

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
    html = html.replace("AGENT_STATS", agent_stats)

    return html

@app.get("/ask")
async def ask(q: str):
    """
    Main Q&A endpoint - routes to appropriate agent and tracks for rating
    
    Args:
        q: User's question
    
    Returns:
        str: HTML-formatted response with rating buttons
    """
    print(f"[/ask] Question: {q}")
    if not q:
        return "Please ask a question."

    try:
        # Route to best agent
        agent = route_to_agent(q)
        print(f"[/ask] Routed to: {agent.name} ({agent.specialty})")

        # Get LLM response with agent context
        answer = ask_llm(q, agent.name, agent.specialty, agent.accuracy)
        print(f"[/ask] Got response (length: {len(answer)})")

        # Format with line breaks
        answer = answer.replace("\n", "<br>")

        # Generate unique message ID and track which agent answered
        message_id = str(hash(f"{q}{answer}"))
        message_to_agent[message_id] = agent.name
        
        # Add rating buttons
        answer += f"""
        <div class="rating-buttons">
            Rate this answer:
            <button class="rate-btn" data-message-id="{message_id}" data-value="1">👍</button>
            <button class="rate-btn" data-message-id="{message_id}" data-value="-1">👎</button>
        </div>
        <div class="agent-badge">Answered by: {agent.name} ({agent.accuracy:.1f}% mastery)</div>
        """

        return answer
        
    except Exception as e:
        print(f"[/ask] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Server error: {str(e)}"

@app.post("/rate")
async def rate(data: dict = Body(...)):
    """
    Handle rating feedback - updates ONLY the agent that answered
    
    Args:
        data: {"message_id": str, "value": int (-1 or 1)}
    
    Returns:
        dict: Status and updated agent info
    """
    message_id = data.get("message_id")
    value = data.get("value")
    
    print(f"[/rate] Rating: {value} for message {message_id}")
    
    # Find which agent answered this message
    agent_name = message_to_agent.get(message_id)
    if not agent_name:
        print("[/rate] Warning: No agent found for this message")
        return {"status": "error", "message": "Agent not found"}
    
    # Update ONLY that agent's accuracy
    for agent in squad:
        if agent.name == agent_name:
            old_accuracy = agent.accuracy
            agent.accuracy = min(100, max(0, agent.accuracy + value * 5))
            print(f"[/rate] Updated {agent.name}: {old_accuracy:.1f}% → {agent.accuracy:.1f}%")
            
            # Save to persistence
            save_squad(squad)
            
            return {
                "status": "ok",
                "agent": agent.name,
                "old_accuracy": old_accuracy,
                "new_accuracy": agent.accuracy
            }
    
    return {"status": "error", "message": "Agent not found in squad"}

@app.post("/set-theme")
async def set_theme(data: dict = Body(...)):
    """Update user's theme preference"""
    global theme
    theme = data.get("theme", "system")
    profile = load_user_profile()
    profile["theme"] = theme
    save_user_profile(profile)
    print(f"[/set-theme] Theme set to: {theme}")
    return {"status": "ok"}

@app.post("/set-accent")
async def set_accent(data: dict = Body(...)):
    """Update user's accent color"""
    global accent_color
    accent_color = data.get("accent", "#3b82f6")
    profile = load_user_profile()
    profile["accent"] = accent_color
    save_user_profile(profile)
    print(f"[/set-accent] Accent set to: {accent_color}")
    return {"status": "ok"}

@app.post("/set-name")
async def set_name(name: str = Form(...)):
    """Set user's name on first visit"""
    global user_name
    user_name = name.strip()
    profile = load_user_profile()
    profile["name"] = user_name
    save_user_profile(profile)
    print(f"[/set-name] User name set to: {user_name}")
    return RedirectResponse(url="/", status_code=303)

@app.get("/agent-stats")
async def agent_stats():
    """API endpoint to get current agent stats (for live updates)"""
    return {
        "agents": [
            {
                "name": agent.name,
                "specialty": agent.specialty,
                "accuracy": agent.accuracy,
                "role": agent.role
            }
            for agent in squad
        ]
    }

if __name__ == "__main__":
    print("=" * 50)
    print("Starting Lumiere - Your Evolving AI Companion")
    print("=" * 50)
    print(f"Squad loaded: {len(squad)} agents")
    for agent in squad:
        print(f"  - {agent.name} ({agent.specialty}): {agent.accuracy:.1f}%")
    print("=" * 50)
    print("Open: http://127.0.0.1:8000")
    print("=" * 50)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
