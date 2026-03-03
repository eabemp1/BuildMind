"""Simple production-usable web UI for execution tracking v1.

The goal is utility-first founder execution workflow, not chat.
"""


def render_home_html() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Execution Tracking SaaS v1</title>
  <style>
    :root{
      --bg:#0b1220; --panel:#111a2b; --soft:#18243a; --text:#e6eefc; --muted:#9fb2d1;
      --accent:#22c55e; --warn:#f59e0b; --danger:#ef4444; --line:#2a3a57;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:linear-gradient(160deg,#0b1220,#101a2e);color:var(--text)}
    .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
    .hero{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:14px}
    h1{margin:0;font-size:1.4rem}
    .sub{color:var(--muted);font-size:.92rem;margin-top:4px}
    .grid{display:grid;gap:12px}
    .grid.top{grid-template-columns:1fr 1fr}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px}
    .card h3{margin:0 0 10px 0;font-size:1rem}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    input,button,select,textarea{
      background:var(--soft);border:1px solid var(--line);color:var(--text);
      border-radius:8px;padding:9px 10px;font:inherit
    }
    input,textarea{flex:1;min-width:130px}
    button{cursor:pointer}
    .btn{background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.5)}
    .btn.warn{background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.45)}
    .btn.danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.45)}
    .muted{color:var(--muted)}
    .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
    .kpi{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:9px}
    .kpi b{display:block;font-size:1.1rem}
    .list{display:grid;gap:8px}
    .item{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:8px}
    .item .head{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .tag{font-size:.75rem;color:var(--muted);border:1px solid var(--line);padding:2px 7px;border-radius:999px}
    .tasks{margin-top:8px;display:grid;gap:6px}
    .task{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .task.done .txt{text-decoration:line-through;opacity:.8}
    .notice{margin-top:10px;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--soft);color:var(--muted)}
    .error{color:#fecaca}
    .ok{color:#bbf7d0}
    @media (max-width: 900px){ .grid.top{grid-template-columns:1fr} .kpis{grid-template-columns:1fr 1fr} }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1>Founder Execution OS</h1>
        <div class="sub">Set goal -> generate roadmap -> complete tasks -> track score.</div>
      </div>
      <button id="refresh-all" class="btn">Refresh Dashboard</button>
    </div>

    <div class="grid top">
      <div class="card">
        <h3>Authentication</h3>
        <div class="row">
          <input id="email" placeholder="email@example.com" />
          <input id="password" type="password" placeholder="password (min 8 chars)" />
        </div>
        <div class="row" style="margin-top:8px">
          <button id="register-btn" class="btn">Register</button>
          <button id="login-btn" class="btn">Login</button>
          <button id="logout-btn" class="btn danger">Logout</button>
        </div>
        <div id="auth-status" class="notice">Not authenticated.</div>
      </div>

      <div class="card">
        <h3>Create Goal Project</h3>
        <div class="row">
          <input id="project-title" placeholder="Launch MVP in 60 days" />
          <input id="project-desc" placeholder="Short execution goal description" />
        </div>
        <div class="row" style="margin-top:8px">
          <button id="create-project-btn" class="btn">Create Project</button>
          <input id="roadmap-weeks" type="number" min="1" max="52" value="4" style="max-width:90px" />
          <button id="generate-roadmap-btn" class="btn warn">Generate Roadmap</button>
        </div>
        <div class="notice">Active project id: <b id="active-project-id">None</b></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Execution Dashboard</h3>
      <div class="kpis">
        <div class="kpi"><span class="muted">Score</span><b id="kpi-score">0</b></div>
        <div class="kpi"><span class="muted">Projects</span><b id="kpi-projects">0</b></div>
        <div class="kpi"><span class="muted">Milestones</span><b id="kpi-milestones">0</b></div>
        <div class="kpi"><span class="muted">Tasks</span><b id="kpi-tasks">0</b></div>
        <div class="kpi"><span class="muted">Consistency</span><b id="kpi-consistency">0%</b></div>
      </div>
      <div class="notice" id="dashboard-breakdown">No data.</div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Project Roadmap</h3>
      <div id="roadmap-list" class="list"></div>
    </div>

    <div id="msg" class="notice">Ready.</div>
  </div>

  <script>
    const TOKEN_KEY = "exec_v1_token";
    const PROJECT_KEY = "exec_v1_project_id";

    const $ = (id) => document.getElementById(id);

    function setMsg(text, kind="") {
      const el = $("msg");
      el.className = "notice " + (kind || "");
      el.textContent = text;
    }

    function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
    function setToken(token) { if(token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); }
    function getProjectId() { return localStorage.getItem(PROJECT_KEY) || ""; }
    function setProjectId(id) { if(id) localStorage.setItem(PROJECT_KEY, String(id)); }

    async function api(path, opts={}) {
      const token = getToken();
      const headers = new Headers(opts.headers || {});
      if (!headers.has("Content-Type") && opts.body) headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", "Bearer " + token);
      const res = await fetch(path, { ...opts, headers });
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok) throw new Error((data && (data.detail || data.error)) || ("HTTP " + res.status));
      return data;
    }

    function updateAuthStatus() {
      const token = getToken();
      $("auth-status").textContent = token ? "Authenticated. JWT saved in browser." : "Not authenticated.";
      $("active-project-id").textContent = getProjectId() || "None";
    }

    async function register() {
      const email = $("email").value.trim();
      const password = $("password").value;
      try {
        const user = await api("/register", { method: "POST", body: JSON.stringify({ email, password }) });
        setMsg("Registered: " + user.email, "ok");
      } catch (e) {
        setMsg("Register failed: " + e.message, "error");
      }
    }

    async function login() {
      const email = $("email").value.trim();
      const password = $("password").value;
      try {
        const auth = await api("/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(auth.access_token);
        updateAuthStatus();
        setMsg("Login successful.", "ok");
        await refreshDashboard();
      } catch (e) {
        setMsg("Login failed: " + e.message, "error");
      }
    }

    function logout() {
      setToken("");
      updateAuthStatus();
      setMsg("Logged out.");
    }

    async function createProject() {
      const title = $("project-title").value.trim();
      const description = $("project-desc").value.trim();
      if (!title) { setMsg("Project title is required.", "error"); return; }
      try {
        const p = await api("/projects", { method: "POST", body: JSON.stringify({ title, description }) });
        setProjectId(p.id);
        updateAuthStatus();
        setMsg("Project created: #" + p.id, "ok");
      } catch (e) {
        setMsg("Create project failed: " + e.message, "error");
      }
    }

    async function generateRoadmap() {
      const id = getProjectId();
      const weeks = Number($("roadmap-weeks").value || 4);
      if (!id) { setMsg("Create/select a project first.", "error"); return; }
      try {
        await api(`/projects/${id}/generate-roadmap`, { method: "POST", body: JSON.stringify({ goal_duration_weeks: weeks }) });
        setMsg("Roadmap generated.", "ok");
        await loadProject();
        await refreshDashboard();
      } catch (e) {
        setMsg("Roadmap generation failed: " + e.message, "error");
      }
    }

    async function completeTask(taskId) {
      try {
        await api(`/tasks/${taskId}/complete`, { method: "POST" });
        setMsg("Task completed.", "ok");
        await loadProject();
        await refreshDashboard();
      } catch (e) {
        setMsg("Task completion failed: " + e.message, "error");
      }
    }

    async function sendFeedback(taskId, feedbackType) {
      try {
        await api(`/feedback`, { method: "POST", body: JSON.stringify({ task_id: taskId, feedback_type: feedbackType }) });
        setMsg("Feedback recorded: " + feedbackType, "ok");
        await refreshDashboard();
      } catch (e) {
        setMsg("Feedback failed: " + e.message, "error");
      }
    }

    async function loadProject() {
      const id = getProjectId();
      const list = $("roadmap-list");
      if (!id) { list.innerHTML = '<div class="muted">No active project selected.</div>'; return; }
      try {
        const p = await api(`/projects/${id}`);
        let html = "";
        for (const m of (p.milestones || [])) {
          let taskHtml = "";
          for (const t of (m.tasks || [])) {
            taskHtml += `
              <div class="task ${t.is_completed ? "done": ""}">
                <span class="txt">${t.description}</span>
                <div class="row">
                  ${t.is_completed ? '<span class="tag">done</span>' : `<button class="btn warn complete-task" data-id="${t.id}">Complete</button>`}
                  <button class="btn feedback" data-id="${t.id}" data-type="positive">+ Feedback</button>
                  <button class="btn danger feedback" data-id="${t.id}" data-type="negative">- Feedback</button>
                </div>
              </div>`;
          }
          html += `
            <div class="item">
              <div class="head">
                <div><b>Week ${m.week_number}</b> - ${m.title}</div>
                <span class="tag">${m.is_completed ? "completed" : "in progress"}</span>
              </div>
              <div class="tasks">${taskHtml || '<div class="muted">No tasks</div>'}</div>
            </div>`;
        }
        list.innerHTML = html || '<div class="muted">No milestones yet. Generate roadmap first.</div>';
      } catch (e) {
        list.innerHTML = '<div class="error">Failed to load project: ' + e.message + '</div>';
      }
    }

    async function refreshDashboard() {
      try {
        const d = await api("/dashboard");
        $("kpi-score").textContent = d.execution_score.toFixed(2);
        $("kpi-projects").textContent = d.project_count;
        $("kpi-milestones").textContent = d.milestone_count;
        $("kpi-tasks").textContent = d.task_count;
        $("kpi-consistency").textContent = Math.round(d.weekly_consistency * 100) + "%";
        $("dashboard-breakdown").textContent =
          `Task completion: ${Math.round(d.task_completion_rate*100)}% | ` +
          `Milestone completion: ${Math.round(d.milestone_completion_rate*100)}% | ` +
          `Feedback positivity: ${Math.round(d.feedback_positivity_ratio*100)}%`;
      } catch (e) {
        $("dashboard-breakdown").textContent = "Dashboard unavailable: " + e.message;
      }
    }

    document.addEventListener("click", async (e) => {
      const completeBtn = e.target.closest(".complete-task");
      if (completeBtn?.dataset?.id) return completeTask(Number(completeBtn.dataset.id));
      const feedbackBtn = e.target.closest(".feedback");
      if (feedbackBtn?.dataset?.id) return sendFeedback(Number(feedbackBtn.dataset.id), String(feedbackBtn.dataset.type || "positive"));
    });

    $("register-btn").addEventListener("click", register);
    $("login-btn").addEventListener("click", login);
    $("logout-btn").addEventListener("click", logout);
    $("create-project-btn").addEventListener("click", createProject);
    $("generate-roadmap-btn").addEventListener("click", generateRoadmap);
    $("refresh-all").addEventListener("click", async () => { await loadProject(); await refreshDashboard(); });

    updateAuthStatus();
    loadProject();
    refreshDashboard();
  </script>
</body>
</html>
"""



