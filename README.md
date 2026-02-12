# 🌟 Lumiere - Your Evolving AI Companion

> An intelligent, multi-agent AI assistant that learns from your feedback and adapts to your needs

![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🎯 What is Lumiere?

Lumiere is a personal AI companion powered by **specialized agents** that:
- 📚 **Math Expert** - Helps with equations, calculus, algebra, and more
- 💰 **Finance Guide** - Assists with investing, budgeting, and money management
- 🍳 **Cooking Buddy** - Provides recipes and cooking tips
- ⏰ **Reminder Manager** - Helps manage tasks and schedules
- 🤝 **Personal Companion** - Your evolving ownable AI identity

### ✨ Key Features

- **Multi-Agent System**: Different AI specialists for different tasks
- **Continuous Learning**: Agents improve with your feedback (👍/👎)
- **Persistent Memory**: Agent skills saved between sessions
- **Beautiful UI**: Dark/light themes with customizable accent colors
- **Privacy-First**: Runs locally, your data stays yours

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- A Groq API key (free at [console.groq.com](https://console.groq.com))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/eabemp1/evolvai-mvp.git
   cd evolvai-mvp
   ```

2. **Install dependencies**
   ```bash
   pip install fastapi uvicorn python-dotenv groq
   ```

3. **Set up your API key**
   
   Create a `.env` file in the project root:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Run Lumiere**
   ```bash
   python main.py
   ```

5. **Open your browser**
   
   Navigate to: `http://127.0.0.1:8000`

---

## 📖 How to Use

### First Time Setup

1. Enter your name when prompted
2. Choose your preferred theme (light/dark/system)
3. Select an accent color

### Asking Questions

Just type your question! Lumiere automatically routes it to the best agent:

- *"What's 15% of 250?"* → **Math Expert**
- *"Should I invest in index funds?"* → **Finance Guide**  
- *"How do I make pasta carbonara?"* → **Cooking Buddy**
- *"Remind me to call mom tomorrow"* → **Reminder Manager**
- *"Tell me a joke"* → **Personal Companion**

### Rating Responses

After each answer, rate it with 👍 or 👎:
- **👍 Good answer** → Agent's accuracy increases (+5%)
- **👎 Bad answer** → Agent's accuracy decreases (-5%)

The agent learns and improves over time!

### Agent Stats

The left panel shows each agent's current mastery level. Watch them evolve as you use Lumiere!

---

## 🏗️ Project Structure

```
evolvai-mvp/
├── main.py              # FastAPI server & routing logic
├── .env                 # API keys (create this!)
├── static/
│   ├── app.css          # Styling
│   └── app.js           # Frontend logic
├── lumiere/
│   ├── ui_home.py
│   ├── web_content.py
│   └── reminder_scheduler.py
├── docs/                # MVP architecture/demo/roadmap docs
├── agents.json          # Agent + memory state
├── blockchain_state.json
├── reminders.json
├── global_events.jsonl
└── user_profile.json
```

---

## 🛠️ Technical Details

### Architecture

```
User Question
     ↓
Question Router (keywords match)
     ↓
Specialized Agent (with context)
     ↓
Groq API (Llama 3.3-70B)
     ↓
Response + Rating Buttons
     ↓
User Rates (👍/👎)
     ↓
Agent Accuracy Updated & Saved
```

### Tech Stack

- **Backend**: FastAPI (Python)
- **LLM**: Groq (Llama 3.3-70B-Versatile)
- **Frontend**: Vanilla JavaScript + CSS
- **Storage**: JSON files (lightweight persistence)

### Agent Routing

Agent routing is keyword/category based in `main.py` via `AGENT_CATEGORY_KEYWORDS`
and core catalog definitions in `CORE_AGENT_CATALOG`.

---

## 🔧 Customization

### Adding New Agent Categories

1. Add category/keywords in `AGENT_CATEGORY_KEYWORDS` in `main.py`.
2. Add default agent label in `CORE_AGENT_CATALOG` in `main.py`.
3. Restart app so core-agent ensure/migration runs.

### Changing the LLM

Lumiere uses Groq by default, but you can add other providers:

```python
MODELS = {
    "groq-llama3.3": {
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "api_key": os.getenv("GROQ_API_KEY")
    },
    "openai-gpt4": {  # Example
        "provider": "openai",
        "model": "gpt-4",
        "api_key": os.getenv("OPENAI_API_KEY")
    }
}
```

---

## 📊 Roadmap

### ✅ Completed
- [x] Multi-agent system
- [x] Learning from feedback
- [x] Persistent memory
- [x] Beautiful UI with themes
- [x] Specialized agent routing

### 🚧 In Progress
- [ ] Conversation history
- [ ] Real reminder notifications
- [ ] Multi-model support
- [ ] Agent performance analytics

### 🔮 Future
- [ ] Voice interface
- [ ] Mobile app
- [ ] Multi-user support
- [ ] NFT achievements (original vision!)
- [ ] Unity/metaverse integration

---

## 🐛 Known Issues

1. **Reminders are conversational only** - No actual system notifications yet
2. **Single user** - Multi-user support coming soon
3. **No conversation persistence** - Chat history resets on refresh

---

## MVP Updates (Current)

- Personal companion ownership is now scoped per user identity.
- Specialist categories are promoted as visible core agents.
- Optional anonymized global learning is supported via:
  - `GET/POST /privacy/share-anonymized`
  - `POST /datasets/build`
  - `GET /datasets/list`
- Reminder notifications support in-browser and local Windows scheduler flows.

### Demo Preparation

```bash
python scripts/seed_demo_data.py
python main.py
```

See `docs/HOD_DEMO_PACKAGE.md` and `docs/30_DAY_PLAN.md`.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **Groq** - For fast, free LLM API
- **FastAPI** - For the excellent web framework
- **You** - For using Lumiere!

---

## 📬 Contact

**Emmanuel** - [@eabemp1](https://github.com/eabemp1)

Project Link: [https://github.com/eabemp1/evolvai-mvp](https://github.com/eabemp1/evolvai-mvp)

---

## 💡 Why "Lumiere"?

French for "light" - because Lumiere illuminates your path to knowledge! 🌟

---

**Built with ❤️ as part of the EvolvAI vision: AI that truly learns and grows with you**
