# 🚀 Deployment Guide for Lumiere

## Option 1: Local Development (Easiest)

Already covered in README.md - just run:
```bash
python main.py
```

---

## Option 2: Deploy to Render (Free Hosting)

### Prerequisites
- GitHub account
- Render account (free at [render.com](https://render.com))

### Steps

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Create a Render Web Service**
   - Go to [render.com/dashboard](https://dashboard.render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repo
   - Configure:
     - **Name**: lumiere-ai
     - **Environment**: Python 3
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

3. **Add Environment Variable**
   - In Render dashboard, add:
     - Key: `GROQ_API_KEY`
     - Value: Your Groq API key

4. **Deploy!**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - Your app will be live at `https://lumiere-ai.onrender.com`

### Notes
- Free tier sleeps after 15 mins of inactivity
- First request after sleep takes ~30s to wake up
- Upgrade to paid tier ($7/mo) for always-on service

---

## Option 3: Deploy to Railway

### Steps

1. **Install Railway CLI** (optional)
   ```bash
   npm install -g @railway/cli
   ```

2. **Deploy via Dashboard**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub"
   - Select your repo
   - Railway auto-detects Python and deploys

3. **Add Environment Variable**
   - In Railway dashboard → Variables
   - Add `GROQ_API_KEY=your_key_here`

4. **Custom Domain** (optional)
   - Railway provides a free `.railway.app` domain
   - Can add custom domain in settings

### Pricing
- Free: $5 credit/month (enough for small usage)
- Hobby: $5/month for more resources

---

## Option 4: Deploy to Vercel (with adapter)

Vercel is great for Next.js, but requires an adapter for FastAPI.

### Option 4a: Use Vercel with Serverless Functions

1. **Install Mangum** (FastAPI → Serverless adapter)
   ```bash
   pip install mangum
   ```

2. **Create `api/index.py`**
   ```python
   from main import app
   from mangum import Mangum
   
   handler = Mangum(app)
   ```

3. **Create `vercel.json`**
   ```json
   {
     "builds": [
       {
         "src": "api/index.py",
         "use": "@vercel/python"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "api/index.py"
       }
     ]
   }
   ```

4. **Deploy**
   ```bash
   vercel --prod
   ```

**Note**: File persistence (squad_memory.json) won't work on Vercel serverless. You'd need to migrate to a database.

---

## Option 5: Docker Container

### Create `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Create `.dockerignore`

```
__pycache__/
*.pyc
*.pyo
.env
.git/
venv/
*.md
```

### Build and Run

```bash
# Build
docker build -t lumiere-ai .

# Run
docker run -p 8000:8000 -e GROQ_API_KEY=your_key_here lumiere-ai
```

### Deploy to Docker Hub

```bash
docker tag lumiere-ai yourusername/lumiere-ai:latest
docker push yourusername/lumiere-ai:latest
```

Then deploy on:
- **DigitalOcean App Platform**
- **AWS ECS/Fargate**
- **Google Cloud Run**
- **Azure Container Instances**

---

## Option 6: VPS (Full Control)

If you have a VPS (DigitalOcean, Linode, AWS EC2, etc.):

1. **SSH into your server**
   ```bash
   ssh user@your-server-ip
   ```

2. **Clone repo**
   ```bash
   git clone https://github.com/eabemp1/evolvai-mvp.git
   cd evolvai-mvp
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create systemd service** (`/etc/systemd/system/lumiere.service`)
   ```ini
   [Unit]
   Description=Lumiere AI Companion
   After=network.target

   [Service]
   User=your-user
   WorkingDirectory=/path/to/evolvai-mvp
   Environment="GROQ_API_KEY=your_key_here"
   ExecStart=/usr/bin/python3 main.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

5. **Enable and start**
   ```bash
   sudo systemctl enable lumiere
   sudo systemctl start lumiere
   ```

6. **Set up Nginx reverse proxy** (optional but recommended)
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

---

## Recommended for Beginners: **Render** or **Railway**

Both offer:
- ✅ Free tier
- ✅ Auto-deploy from GitHub
- ✅ Easy environment variables
- ✅ HTTPS included
- ✅ No server management

**Railway** is slightly faster to set up, but **Render** has better free tier limits.

---

## Database Migration (for production)

For production with multiple users, replace JSON files with a database:

### SQLite (simplest upgrade)

```python
import sqlite3

def save_squad(squad):
    conn = sqlite3.connect('lumiere.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS agents
                 (name TEXT, specialty TEXT, accuracy REAL, role TEXT)''')
    c.execute('DELETE FROM agents')  # Clear old data
    for agent in squad:
        c.execute('INSERT INTO agents VALUES (?,?,?,?)',
                  (agent.name, agent.specialty, agent.accuracy, agent.role))
    conn.commit()
    conn.close()
```

### PostgreSQL (for scale)

```bash
pip install psycopg2-binary
```

Update `memory.py` to use PostgreSQL connection string from environment.

---

## Environment Variables

Make sure to set these in your deployment:

- `GROQ_API_KEY` - Your Groq API key (required)
- `PORT` - Port to run on (auto-set by most hosts)
- `DATABASE_URL` - If using PostgreSQL (optional)

---

## Monitoring & Logging

Add basic monitoring:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
```

For production, consider:
- **Sentry** - Error tracking
- **LogTail** - Log management  
- **UptimeRobot** - Uptime monitoring

---

## Performance Tips

1. **Use Redis for sessions** (if you add multi-user support)
2. **Add rate limiting** to prevent abuse
3. **Cache LLM responses** for common questions
4. **Use CDN** for static files (CSS/JS)
5. **Enable gzip compression** in production

---

## Security Checklist

- [ ] Never commit `.env` file
- [ ] Use HTTPS in production
- [ ] Add rate limiting
- [ ] Sanitize user inputs
- [ ] Set CORS policies
- [ ] Keep dependencies updated
- [ ] Use environment variables for secrets

---

**Questions?** Open an issue on GitHub or check the deployment docs for your chosen platform!
