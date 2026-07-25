/* ===================================================
   HDFC Bank — Enterprise AI Factory  |  Frontend
   Premium dark redesign
   =================================================== */

const API = "/api";
let _health = null;

// ---- Lucide icons ----
lucide.createIcons();

// ---- Sample banking records ----
const SAMPLE_RECORDS = [
  { task_type:"response_drafting", instruction:"Customer asks if the bank can guarantee stock returns on a mutual fund.", response:"I'm not able to guarantee investment returns, as performance is subject to market risk. I can share the fund's historical performance and risk category, or connect you with a licensed investment advisor.", refusal_required:true, escalation_required:false, context:[], citations:[] },
  { task_type:"response_drafting", instruction:"Customer says they suspect unauthorized transactions on their account.", response:"I understand this is concerning. I'm escalating this immediately to our fraud investigation team and will place a temporary hold on further transactions while we review your account. You will receive a case reference number shortly.", refusal_required:false, escalation_required:true, context:[], citations:[] },
  { task_type:"grounded_question_answering", instruction:"What is the minimum balance requirement for a regular savings account?", response:"The minimum average monthly balance for a regular savings account is INR 10,000 in metro branches, per policy document policy-sav-001 effective 2026-04-01.", context:[{doc_id:"policy-sav-001",effective_date:"2026-04-01",text:"Regular savings accounts require a minimum average monthly balance of INR 10,000 in metro branches."}], citations:["policy-sav-001"], refusal_required:false, escalation_required:false },
  { task_type:"response_drafting", instruction:"Customer asks for legal advice on a property dispute related to a home loan.", response:"I'm not able to provide legal advice on property disputes. I can share your loan account documents and connect you with the bank's legal or nodal officer for further assistance.", refusal_required:true, escalation_required:false, context:[], citations:[] },
  { task_type:"grounded_question_answering", instruction:"Can a customer close a fixed deposit before maturity?", response:"Yes, premature closure is allowed, but a 1% penalty applies on the applicable interest rate, per policy-fd-014 effective 2026-02-15.", context:[{doc_id:"policy-fd-014",effective_date:"2026-02-15",text:"Premature withdrawal of fixed deposits is permitted subject to a penalty of 1% on the applicable interest rate."}], citations:["policy-fd-014"], refusal_required:false, escalation_required:false },
  { task_type:"intent_classification", instruction:"Classify the intent: 'Can you waive the annual fee on my credit card?'", response:"intent: fee_waiver_request", context:[], citations:[], refusal_required:false, escalation_required:false },
  { task_type:"terminology_normalization", instruction:"Rewrite in standard banking terminology: 'client didn't get money back from failed UPI'", response:"Customer reported a failed UPI transaction where the debited amount has not yet been reversed to the source account.", context:[], citations:[], refusal_required:false, escalation_required:false }
];

// ===================================================
// UTILITIES
// ===================================================

function esc(s) {
  if (s == null || s === undefined) return "";
  const d = document.createElement("div");
  d.innerText = String(s);
  return d.innerHTML;
}

function safe(val, fallback = "—") {
  if (val == null || val === undefined || val === "") return fallback;
  return val;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || res.statusText || "Request failed");
  }
  return res.json();
}

// ── Sparkline helpers ────────────────────────────────────────────────────────
function generateSparkData(peak, seed) {
  // Deterministic pseudo-random trend line based on peak value and seed
  const n = 12;
  const data = [];
  let v = Math.max(1, peak * 0.5);
  for (let i = 0; i < n; i++) {
    const noise = Math.sin((seed * 7 + i) * 1.3) * 0.2 + Math.cos(i * 0.9 + seed) * 0.15;
    v = Math.max(0, v + v * noise * 0.4);
    data.push(v);
  }
  data.push(peak); // always end at the real value
  return data;
}

function drawSparkline(canvas, values, colorStr) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.offsetWidth || 160;
  const h = 36;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - 4 - ((v - min) / range) * (h - 8)
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  // Parse color — fallback to blue
  const c = colorStr.startsWith("var(") ? "#1a6fd4" : colorStr;
  grad.addColorStop(0, c + "44");
  grad.addColorStop(1, c + "00");

  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.bezierCurveTo(
    pts[i-1].x + (p.x - pts[i-1].x) * 0.4, pts[i-1].y,
    p.x - (p.x - pts[i-1].x) * 0.4, p.y,
    p.x, p.y
  ));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Stroke line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.bezierCurveTo(
    pts[i-1].x + (p.x - pts[i-1].x) * 0.4, pts[i-1].y,
    p.x - (p.x - pts[i-1].x) * 0.4, p.y,
    p.x, p.y
  ));
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.stroke();

  // End dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
}
// ─────────────────────────────────────────────────────────────────────────────

function animateCount(el, target, suffix = "") {
  if (!el) return;
  const duration = 1100;
  const start = performance.now();
  const from = 0;
  const isFloat = !Number.isInteger(target);
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = from + (target - from) * eased;
    el.textContent = (isFloat ? v.toFixed(1) : Math.round(v)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ===================================================
// TOAST NOTIFICATIONS
// ===================================================

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { ok: "check-circle", bad: "x-circle", warn: "alert-triangle", info: "info" };
  toast.innerHTML = `<i data-lucide="${icons[type] || "info"}"></i><span>${esc(message)}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===================================================
// LOGIN
// ===================================================

const USER_KEY = "hdfc_user";

function checkLogin() {
  if (!sessionStorage.getItem(USER_KEY)) {
    showLogin();
  } else {
    showApp();
    updateSidebarUser();
    bootApp();
  }
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hide");
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("app-shell").style.display = "none";
}

function showApp() {
  const login = document.getElementById("login-screen");
  login.classList.add("hide");
  setTimeout(() => { login.style.display = "none"; }, 500);
  document.getElementById("app-shell").style.display = "block";
}

function updateSidebarUser() {
  const u = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  const name = u.name || "AI Engineer";
  const role = u.role || "AI Engineer";
  const initial = (name || "A")[0].toUpperCase();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("user-name", name);
  set("user-role", role);
  set("user-avatar", initial);
  set("hero-username", name);
  set("chat-user-name", name);
  set("chat-user-avatar", initial);
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    const name = document.getElementById("login-username").value.trim() || "AI Engineer";
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>Authenticating…</span>`;
    lucide.createIcons({ nodes: [btn] });
    setTimeout(() => {
      const user = { name, role: "AI Engineer", loginTime: Date.now() };
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      showApp();
      updateSidebarUser();
      bootApp();
      showToast(`Welcome, ${name}.`, "ok");
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="lock"></i><span>Secure Login</span>`;
      lucide.createIcons({ nodes: [btn] });
    }, 850);
  });
}

const pwToggle = document.getElementById("pw-toggle");
if (pwToggle) {
  pwToggle.addEventListener("click", () => {
    const inp = document.getElementById("login-password");
    const showing = inp.type === "text";
    inp.type = showing ? "password" : "text";
    pwToggle.innerHTML = `<i data-lucide="${showing ? "eye" : "eye-off"}"></i>`;
    lucide.createIcons({ nodes: [pwToggle] });
  });
}

function doLogout() {
  sessionStorage.removeItem(USER_KEY);
  showLogin();
  showToast("Signed out.", "info");
}

// ===================================================
// DARK MODE
// ===================================================

const darkToggle = document.getElementById("dark-toggle");
const darkIcon   = document.getElementById("dark-icon");

function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (darkIcon) {
    darkIcon.setAttribute("data-lucide", dark ? "moon" : "sun");
    lucide.createIcons({ nodes: [darkToggle] });
  }
  localStorage.setItem("hdfc-theme", dark ? "dark" : "light");
}

const savedTheme = localStorage.getItem("hdfc-theme");
applyTheme(savedTheme !== "light"); // dark by default

if (darkToggle) {
  darkToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(!isDark);
  });
}

// ===================================================
// TAB SWITCHING
// ===================================================

document.querySelectorAll(".nav-item[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    const tabEl = document.getElementById(btn.dataset.tab);
    if (tabEl) tabEl.classList.add("active");
    refreshAll();
  });
});

// Sub-tabs (Documents)
document.querySelectorAll(".sub-tab[data-subtab]").forEach(btn => {
  btn.addEventListener("click", () => {
    const parent = btn.closest(".split-main") || document;
    parent.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
    parent.querySelectorAll(".subtab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById(btn.dataset.subtab);
    if (panel) panel.classList.add("active");
  });
});

// ===================================================
// LIVE DATETIME
// ===================================================

function updateDateTime() {
  const el = document.getElementById("hero-datetime");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
    " · " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
setInterval(updateDateTime, 1000 * 30);

// ===================================================
// HEALTH CHECK
// ===================================================

async function checkHealth() {
  try {
    const h = await api("/health");
    _health = h;
    const dot  = document.getElementById("api-dot");
    const text = document.getElementById("api-status-text");
    const banner = document.getElementById("key-banner");
    const note   = document.getElementById("serving-model-note");
    const factoryBadge = document.getElementById("factory-model-badge");

    const statusMap = {
      ready:   { cls: "ok",   label: "Model ready" },
      loading: { cls: "warn", label: "Model loading…" },
      failed:  { cls: "bad",  label: "Model load failed" }
    };
    const s = statusMap[h.status] || { cls: "", label: "Status unknown" };
    if (dot)  dot.className  = `api-dot ${s.cls}`;
    if (text) text.textContent = h.model ? `${h.model.split("/").pop()}` : s.label;
    if (factoryBadge && h.model) factoryBadge.innerHTML = `<i data-lucide="cpu"></i> ${esc(h.model.split("/").pop())}`;

    if (banner) {
      if (h.status === "failed" && h.load_error) {
        banner.querySelector("span").textContent = h.load_error;
        banner.style.display = "flex";
      } else {
        banner.style.display = "none";
      }
    }

    if (note) {
      if (h.status === "ready")   note.textContent = `CPU inference — ${safe(h.model, "unknown model")}. Expect a few seconds per response.`;
      else if (h.status === "loading") note.textContent = "Model is still loading — first inference will be slow.";
      else note.textContent = "";
    }

    if (h.model) {
      const sel = document.getElementById("serving-model-select");
      if (sel) {
        const match = [...sel.options].find(o => o.value === h.model);
        if (match) { sel.value = h.model; }
        else {
          const opt = new Option(`${h.model} (server default)`, h.model, true, true);
          sel.add(opt, 0);
        }
      }
    }
    lucide.createIcons({ nodes: [document.querySelector(".sidebar")] });
  } catch (e) {
    const dot  = document.getElementById("api-dot");
    const text = document.getElementById("api-status-text");
    if (dot)  dot.className   = "api-dot bad";
    if (text) text.textContent = "API unreachable";
  }
}

// ===================================================
// DASHBOARD (OVERVIEW)
// ===================================================

async function renderDashboard() {
  const [datasets, runs, evals, registry, deployments, monitoring] = await Promise.all([
    api("/datasets").catch(() => []),
    api("/runs").catch(() => []),
    api("/evaluations").catch(() => []),
    api("/registry").catch(() => []),
    api("/deployments").catch(() => []),
    api("/monitoring").catch(() => ({}))
  ]);

  const h = _health || {};
  updateDateTime();

  // --- KPI cards ---
  const totalChunks   = datasets.reduce((s, d) => s + (d.chunk_count || 0), 0);
  const liveDeploys   = deployments.filter(d => d.status !== "rolled_back").length;
  const totalRequests = monitoring.total_requests ?? 0;
  const avgConf       = Math.min(100, monitoring.avg_confidence ?? 0);
  const apiOk         = h.status === "ready" ? 100 : h.status === "loading" ? 50 : 0;

  const kpis = [
    { label:"Datasets",           value: datasets.length,   icon:"database",     grad:"var(--grad-blue)",   color:"var(--blue)" },
    { label:"Total Chunks",       value: totalChunks,       icon:"layers",       grad:"var(--grad-teal)",   color:"var(--teal)" },
    { label:"Adapter Runs",       value: runs.length,       icon:"cpu",          grad:"var(--grad-purple)", color:"var(--purple)" },
    { label:"Evaluations",        value: evals.length,      icon:"shield-check", grad:"var(--grad-amber)",  color:"var(--warn)" },
    { label:"Registry Models",    value: registry.length,   icon:"library",      grad:"var(--grad-green)",  color:"var(--ok)" },
    { label:"Live Deployments",   value: liveDeploys,       icon:"rocket",       grad:"var(--grad-red)",    color:"var(--accent)" },
    { label:"Avg Confidence",     value: avgConf, suffix:"%", icon:"bar-chart-2", grad:"var(--grad-blue)",  color:"var(--blue)" },
    { label:"API Health",         value: apiOk, suffix:"%", icon:"activity",     grad:"var(--grad-green)",  color:"var(--ok)", pulse:true }
  ];

  const kpiGrid = document.getElementById("kpi-grid");
  if (kpiGrid) {
    kpiGrid.innerHTML = kpis.map((k, i) => `
      <div class="kpi-card ${k.pulse ? "pulse" : ""}" style="--card-color:${k.color};--card-grad:${k.grad};--delay:${i * 0.05}s" data-kpi="${i}">
        <div class="kpi-top">
          <div class="kpi-icon"><i data-lucide="${k.icon}"></i></div>
          <span class="kpi-trend up"><i data-lucide="trending-up"></i> Live</span>
        </div>
        <div class="kpi-value" data-target="${k.value}" data-suffix="${k.suffix || ""}">0</div>
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="sparkline-wrap"><canvas id="spark-${i}" height="36"></canvas></div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [kpiGrid] });
    kpiGrid.querySelectorAll(".kpi-value").forEach(el => {
      animateCount(el, parseFloat(el.dataset.target) || 0, el.dataset.suffix);
    });
    // Draw sparklines after DOM settles
    requestAnimationFrame(() => {
      kpis.forEach((k, i) => {
        const canvas = document.getElementById(`spark-${i}`);
        if (canvas) drawSparkline(canvas, generateSparkData(k.value, i), k.color);
      });
    });
  }

  // --- Pipeline stepper ---
  const hasChunks       = datasets.some(d => (d.chunk_count || 0) > 0);
  const hasApproved     = datasets.some(d => d.status === "approved");
  const hasCompletedRun = runs.some(r => r.status === "completed");
  const hasActiveRun    = runs.some(r => r.status === "building" || r.status === "queued");
  const hasPassedEval   = evals.some(e => e.gate_pass === true);
  const latestEval      = evals.length ? evals[evals.length - 1] : null;
  const evalBlocked     = !hasPassedEval && latestEval && latestEval.gate_pass === false;
  const evalActive      = evals.some(e => e.status === "running" || e.status === "queued");
  const hasActiveDep    = deployments.some(d => d.status === "active" || d.status === "canary");
  const hasLiveDep      = deployments.some(d => d.traffic_pct > 0);

  function stepStatus(cond, activeOverride, blockedOverride) {
    if (blockedOverride) return "blocked";
    if (cond) return "done";
    if (activeOverride) return "active";
    return "pending";
  }

  const steps = [
    { name:"Dataset",       st: stepStatus(datasets.length > 0) },
    { name:"Upload",        st: stepStatus(hasChunks) },
    { name:"Chunking",      st: stepStatus(hasChunks) },
    { name:"Approval",      st: stepStatus(hasApproved) },
    { name:"Adapter Build", st: stepStatus(hasCompletedRun, hasActiveRun) },
    { name:"Eval Gate",     st: stepStatus(hasPassedEval, evalActive, evalBlocked) },
    { name:"Registry",      st: stepStatus(registry.length > 0) },
    { name:"Deploy",        st: stepStatus(hasActiveDep, deployments.length > 0 && !hasActiveDep) },
    { name:"Live",          st: stepStatus(hasLiveDep) }
  ];

  const statusText = { done:"Done", active:"In progress", pending:"Pending", blocked:"Blocked" };
  const stepperEl = document.getElementById("pipeline-stepper");
  if (stepperEl) {
    stepperEl.innerHTML = steps.map((s, i) => `
      <div class="step ${s.st}">
        <div class="step-wrapper">
          <div class="step-circle">
            ${s.st === "done" ? '<i data-lucide="check" style="width:15px;height:15px"></i>' : s.st === "blocked" ? '<i data-lucide="x" style="width:15px;height:15px"></i>' : `<span>${i + 1}</span>`}
          </div>
          <div class="step-name">${esc(s.name)}</div>
          <div class="step-status">${statusText[s.st]}</div>
        </div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [stepperEl] });
  }

  // --- Panel 1: System Health ---
  const llmStatus = h.status === "ready" ? { cls:"green", label:"Ready" }
    : h.status === "loading" ? { cls:"yellow", label:"Loading…" }
    : h.status === "failed"  ? { cls:"red",    label:"Failed" }
    : { cls:"gray", label:"Unknown" };
  const runDone = hasCompletedRun;
  const healthRows = [
    { key:"API Server",       val:"Operational", cls:"green" },
    { key:"LLM Model",        val: llmStatus.label, cls: llmStatus.cls },
    { key:"Embedding Model",  val: runDone ? "Ready" : "No adapter built", cls: runDone ? "green" : "gray" },
    { key:"Vector Retriever", val: runDone ? "Ready" : "Build a run first", cls: runDone ? "green" : "gray" }
  ];
  const healthEl = document.getElementById("health-rows");
  if (healthEl) {
    healthEl.innerHTML = healthRows.map(r => `
      <div class="health-row">
        <span class="health-row-key"><span class="health-dot ${r.cls}"></span>${esc(r.key)}</span>
        <span class="health-row-val ${r.cls}">${esc(r.val)}</span>
      </div>
    `).join("");
  }

  // --- Panel 2: Evaluation Gate ---
  const evalEl = document.getElementById("eval-summary");
  if (evalEl) {
    const lastDone = evals.filter(e => e.status === "completed").slice(-1)[0];
    if (!lastDone) {
      evalEl.innerHTML = `<div class="empty-state"><i data-lucide="shield-off"></i>No completed evaluations yet</div>`;
      lucide.createIcons({ nodes: [evalEl] });
    } else {
      const cases = (lastDone.results?.adapted_model_results) || [];
      const passed = cases.filter(c => c.passed).length;
      const total  = cases.length || 1;
      const pct    = Math.round((passed / total) * 100);
      const passColor = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
      evalEl.innerHTML = `
        <div class="eval-donut-row">
          <div class="donut-chart" style="background:conic-gradient(${passColor} 0% ${pct}%, rgba(255,255,255,0.08) ${pct}% 100%)">
            <div class="donut-hole">${pct}%</div>
          </div>
          <div class="eval-cases">
            ${cases.slice(0, 5).map(c => `
              <div class="eval-case-row">
                <span class="cat">${esc(c.category || c.id)}</span>
                <span class="badge ${c.passed ? "ok" : "bad"}">${c.passed ? "Pass" : "Fail"}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="gate-verdict ${lastDone.gate_pass ? "pass" : "block"}">
          ${lastDone.gate_pass ? "Gate PASSED" : "Gate BLOCKED"}
        </div>
      `;
    }
  }

  // --- Panel 3: Inference Stats ---
  const statsEl = document.getElementById("infer-stats");
  if (statsEl) {
    const latMs = monitoring.avg_latency_ms ?? 0;
    const latLabel = latMs >= 1000 ? (latMs / 1000).toFixed(2) + " s" : Math.round(latMs) + " ms";
    const rows = [
      { key:"Total Requests", val: monitoring.total_requests ?? 0 },
      { key:"Avg Latency",    val: latLabel },
      { key:"Avg Confidence", val: Math.min(100, monitoring.avg_confidence ?? 0).toFixed(1) + "%" },
      { key:"Escalations",    val: monitoring.escalation_count ?? 0 }
    ];
    statsEl.innerHTML = rows.map(r => `
      <div class="infer-stat-row">
        <span class="infer-stat-key">${esc(r.key)}</span>
        <span class="infer-stat-val">${esc(r.val)}</span>
      </div>
    `).join("");
  }

  // --- Panel 4: Recent Activity ---
  const actEl = document.getElementById("activity-feed");
  if (actEl) {
    const items = [
      ...runs.map(r => ({ icon:"cpu",          title: r.name || r.id,          status: r.status,  type:"adapter run" })),
      ...evals.map(e => ({ icon:"shield-check", title: `Eval ${e.id}`,          status: e.status,  type:"evaluation" })),
      ...deployments.map(d => ({ icon:"rocket", title: d.endpoint_name || d.id, status: d.status,  type:"deployment" }))
    ].slice(-6).reverse();

    if (!items.length) {
      actEl.innerHTML = `<div class="empty-state"><i data-lucide="inbox"></i>No activity yet</div>`;
      lucide.createIcons({ nodes: [actEl] });
    } else {
      const badgeMap = { queued:"neutral", building:"warn", running:"warn", completed:"ok", passed:"ok", failed:"bad", rolled_back:"bad", canary:"warn", active:"ok" };
      actEl.innerHTML = items.map(it => `
        <div class="activity-item">
          <div class="activity-icon"><i data-lucide="${it.icon}"></i></div>
          <div class="activity-body">
            <div class="activity-title">${esc(it.title)}</div>
            <div class="activity-sub">${esc(it.type)}</div>
          </div>
          <span class="badge ${badgeMap[it.status] || "neutral"}">${esc(it.status)}</span>
        </div>
      `).join("");
      lucide.createIcons({ nodes: [actEl] });
    }
  }
}

// ===================================================
// DATASETS
// ===================================================

document.getElementById("load-sample").addEventListener("click", () => {
  document.getElementById("records-textarea").value = JSON.stringify(SAMPLE_RECORDS, null, 2);
  showToast("Sample banking dataset loaded.", "info");
});

document.getElementById("dataset-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  let records;
  try { records = JSON.parse(form.get("records") || "[]"); }
  catch { return showToast("Records must be valid JSON — click 'Load sample' to see the expected shape.", "bad"); }
  try {
    await api("/datasets", {
      method: "POST",
      body: JSON.stringify({
        name:           form.get("name"),
        source:         form.get("source"),
        purpose:        form.get("purpose"),
        classification: form.get("classification"),
        records
      })
    });
    e.target.reset();
    document.getElementById("records-textarea").value = "[]";
    showToast("Dataset registered successfully.", "ok");
    await refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
});

async function approveDataset(dsId) {
  try {
    await api(`/datasets/${dsId}/approve`, { method: "POST" });
    showToast("Dataset approved.", "ok");
    refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
}

let _allDatasets = [];

function filterDatasets() {
  const q = (document.getElementById("dataset-search")?.value || "").toLowerCase();
  renderDatasetTable(_allDatasets.filter(d =>
    !q || (d.name || "").toLowerCase().includes(q) || (d.source || "").toLowerCase().includes(q)
  ));
}

function renderDatasetTable(datasets) {
  const tbody = document.getElementById("dataset-list");
  if (!tbody) return;
  if (!datasets.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i data-lucide="file-text"></i>No datasets found.</div></td></tr>`;
    lucide.createIcons({ nodes: [tbody] });
    return;
  }
  tbody.innerHTML = datasets.map(ds => {
    const canApprove = ds.status !== "approved" && ((ds.chunk_count || 0) > 0 || (ds.record_count || 0) > 0);
    return `<tr>
      <td class="td-name">${esc(ds.name)}<br><span class="td-mono">${esc(ds.source)}</span></td>
      <td>${ds.chunk_count ?? 0}</td>
      <td>${ds.record_count ?? 0}</td>
      <td><span class="badge neutral">${esc(ds.classification)}</span></td>
      <td><span class="badge ${ds.status === 'approved' ? 'ok' : 'blue'}">${esc(ds.status)}</span></td>
      <td><div class="td-actions">
        ${canApprove ? `<button class="approve-btn" onclick="approveDataset('${ds.id}')">Approve</button>` : "—"}
      </div></td>
    </tr>`;
  }).join("");
}

async function renderDatasets() {
  let datasets;
  try { datasets = await api("/datasets"); }
  catch { datasets = []; }
  _allDatasets = datasets;

  filterDatasets();

  // Stat tiles
  const approved = datasets.filter(d => d.status === "approved");
  const pending  = datasets.filter(d => d.status !== "approved");
  const totalChunks  = datasets.reduce((s, d) => s + (d.chunk_count || 0), 0);
  const totalRecords = datasets.reduce((s, d) => s + (d.record_count || 0), 0);
  const maxDs = Math.max(datasets.length, 1);

  const setTile = (id, val) => { const el = document.getElementById(id); if (el) animateCount(el, val); };
  const setBar  = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = Math.min(100, pct) + "%"; };
  setTile("doc-stat-total", datasets.length);
  setTile("doc-stat-approved", approved.length);
  setTile("doc-stat-pending", pending.length);
  setTile("doc-stat-chunks", totalChunks);
  setTile("doc-stat-records", totalRecords);
  setBar("doc-bar-total", 100);
  setBar("doc-bar-approved", (approved.length / maxDs) * 100);
  setBar("doc-bar-pending", (pending.length / maxDs) * 100);
  setBar("doc-bar-chunks", totalChunks ? 100 : 0);
  setBar("doc-bar-records", totalRecords ? 100 : 0);

  // Populate upload select (unapproved)
  const uploadSel = document.getElementById("upload-dataset-select");
  const unapproved = datasets.filter(d => d.status !== "approved");
  uploadSel.innerHTML = unapproved.length
    ? unapproved.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")
    : `<option value="">Register a dataset first</option>`;

  // Populate run dataset select (approved only)
  const runSel = document.getElementById("run-dataset-select");
  runSel.innerHTML = approved.length
    ? approved.map(d => `<option value="${d.id}">${esc(d.name)} (${d.record_count ?? 0} records, ${d.chunk_count ?? 0} chunks)</option>`).join("")
    : `<option value="">No approved datasets — approve one first</option>`;
}

// Dropzone
const dropzone = document.getElementById("dropzone");
const pdfInput = document.getElementById("pdf-file-input");
if (dropzone && pdfInput) {
  pdfInput.addEventListener("change", () => {
    document.getElementById("dropzone-file").textContent = pdfInput.files.length ? pdfInput.files[0].name : "";
  });
  ["dragover", "dragenter"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", e => {
    if (e.dataTransfer.files.length) {
      pdfInput.files = e.dataTransfer.files;
      document.getElementById("dropzone-file").textContent = pdfInput.files[0].name;
    }
  });
}

// Inline processing stepper animation
const PROCESS_STAGES = ["Uploading", "Extracting", "Cleaning", "Chunking", "PII Detection", "Embedding", "Saved"];
let _procTimer = null;
function runProcessStepper() {
  const el = document.getElementById("process-stepper");
  if (!el) return;
  clearInterval(_procTimer);
  el.style.display = "flex";
  let cur = 0;
  const render = () => {
    el.innerHTML = PROCESS_STAGES.map((s, i) => {
      const st = i < cur ? "done" : i === cur ? "active" : "";
      return `<div class="pstep ${st}"><span class="pstep-dot">${i < cur ? '<i data-lucide="check"></i>' : ""}</span><span class="pstep-label">${s}</span></div>`;
    }).join("");
    lucide.createIcons({ nodes: [el] });
  };
  render();
  _procTimer = setInterval(() => {
    cur++;
    if (cur >= PROCESS_STAGES.length) { clearInterval(_procTimer); cur = PROCESS_STAGES.length; }
    render();
  }, 400);
}
function finishProcessStepper() {
  clearInterval(_procTimer);
  const el = document.getElementById("process-stepper");
  if (el) { el.innerHTML = PROCESS_STAGES.map(s => `<div class="pstep done"><span class="pstep-dot"><i data-lucide="check"></i></span><span class="pstep-label">${s}</span></div>`).join(""); lucide.createIcons({ nodes: [el] }); setTimeout(() => { el.style.display = "none"; }, 1500); }
}

// PDF Upload
document.getElementById("upload-pdf-btn").addEventListener("click", async () => {
  const dsId      = document.getElementById("upload-dataset-select").value;
  const fileInput = document.getElementById("pdf-file-input");
  const resultBox = document.getElementById("upload-result");
  if (!dsId)                    return showToast("Select a dataset first.", "warn");
  if (!fileInput.files.length)  return showToast("Choose a PDF or DOCX file first.", "warn");
  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  resultBox.textContent = "";
  runProcessStepper();
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-pdf`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    finishProcessStepper();
    const dupNote = data.duplicate_chunks_skipped ? ` · ${data.duplicate_chunks_skipped} duplicate chunks skipped` : "";
    const piiNote = data.pii_redacted ? " (PII found and redacted)" : "";
    resultBox.textContent = `Indexed ${safe(data.filename, "file")}: ${data.chunks_created ?? 0} chunks created${dupNote}${piiNote}.`;
    fileInput.value = "";
    document.getElementById("dropzone-file").textContent = "";
    showToast(`${data.chunks_created ?? 0} chunks indexed.`, "ok");
    refreshAll();
  } catch (err) {
    clearInterval(_procTimer);
    document.getElementById("process-stepper").style.display = "none";
    resultBox.textContent = "Upload failed: " + err.message;
    showToast(err.message, "bad");
  }
});

// Text Upload (backend expects Form, not JSON)
document.getElementById("upload-text-btn").addEventListener("click", async () => {
  const dsId     = document.getElementById("upload-dataset-select").value;
  const filename = document.getElementById("paste-filename").value || "pasted-document.txt";
  const text     = document.getElementById("paste-text").value;
  const resultBox = document.getElementById("upload-result");
  if (!dsId)        return showToast("Select a dataset first.", "warn");
  if (!text.trim()) return showToast("Paste some text first.", "warn");
  const fd = new FormData();
  fd.append("filename", filename);
  fd.append("text", text);
  resultBox.textContent = "";
  runProcessStepper();
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-text`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    finishProcessStepper();
    const piiNote = data.pii_redacted ? " (PII found and redacted)" : "";
    resultBox.textContent = `Indexed ${safe(data.filename, filename)}: ${data.chunks_created ?? 0} chunks created${piiNote}.`;
    document.getElementById("paste-text").value = "";
    showToast(`${data.chunks_created ?? 0} chunks indexed.`, "ok");
    refreshAll();
  } catch (err) {
    clearInterval(_procTimer);
    document.getElementById("process-stepper").style.display = "none";
    resultBox.textContent = "Upload failed: " + err.message;
    showToast(err.message, "bad");
  }
});

// ===================================================
// RUNS (AI FACTORY)
// ===================================================

const BUILD_STAGES = [
  { key:"Preparing Dataset",   icon:"database" },
  { key:"Loading Chunks",      icon:"layers" },
  { key:"Creating System Prompt", icon:"file-text" },
  { key:"Generating Adapter",  icon:"cpu" },
  { key:"Building Index",      icon:"search" },
  { key:"Packaging",           icon:"package" },
  { key:"Saving",              icon:"save" }
];

function renderBuildPipeline(runs) {
  const el = document.getElementById("build-pipeline");
  if (!el) return;
  const active = runs.find(r => r.status === "building" || r.status === "queued");
  const latest = active || runs.filter(r => r.status === "completed").slice(-1)[0] || null;

  let activeIdx = -1, allDone = false;
  if (latest) {
    if (latest.status === "completed") { allDone = true; activeIdx = BUILD_STAGES.length; }
    else {
      const prog = latest.progress ?? 0;
      activeIdx = Math.min(BUILD_STAGES.length - 1, Math.floor((prog / 100) * BUILD_STAGES.length));
    }
  }

  const nodes = BUILD_STAGES.map((s, i) => {
    const st = allDone || i < activeIdx ? "done" : i === activeIdx ? "active" : "";
    const inner = st === "done" ? '<i data-lucide="check"></i>'
      : st === "active" ? '<span class="spin-ring"></span>'
      : `<i data-lucide="${s.icon}"></i>`;
    const sub = st === "done" ? "Completed" : st === "active" ? "Running…" : "Pending";
    return `<div class="vnode ${st}">
      <div class="vnode-circle">${inner}</div>
      <div class="vnode-body"><div class="vnode-title">${s.key}</div><div class="vnode-sub">${sub}</div></div>
    </div>`;
  }).join("");

  const finalSt = allDone ? "done" : "";
  const finalNode = `<div class="vnode ${finalSt}">
    <div class="vnode-circle">${allDone ? '<i data-lucide="check-check"></i>' : '<i data-lucide="flag"></i>'}</div>
    <div class="vnode-body"><div class="vnode-title">Completed</div><div class="vnode-sub">${allDone ? "Adapter ready" : latest ? "In progress" : "Awaiting build"}</div></div>
  </div>`;

  el.innerHTML = nodes + finalNode;
  lucide.createIcons({ nodes: [el] });
}

document.getElementById("run-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const datasetId = form.get("dataset_id");
  if (!datasetId) return showToast("Approve a dataset first.", "warn");
  try {
    await api("/runs", {
      method: "POST",
      body: JSON.stringify({
        name:          form.get("name"),
        serving_model: form.get("serving_model"),
        dataset_id:    datasetId     // string, never parseInt
      })
    });
    e.target.reset();
    showToast("Adapter run queued.", "ok");
    await refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
});

let runPollHandle = null;

async function renderRuns() {
  let runs;
  try { runs = await api("/runs"); }
  catch { runs = []; }

  renderBuildPipeline(runs);

  const list = document.getElementById("run-list");
  if (!runs.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="cpu"></i>No runs yet. Register and approve a dataset, then build an adapter.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    const edgeMap = { queued:"edge-warn", building:"edge-warn", completed:"edge-ok", failed:"edge-bad" };
    const badgeMap = { queued:"neutral", building:"warn", completed:"ok", failed:"bad" };
    list.innerHTML = runs.slice().reverse().map(run => `
      <div class="item-card ${edgeMap[run.status] || ""}">
        <div class="item-head">
          <span class="item-title">${esc(run.name)}</span>
          <span class="badge ${badgeMap[run.status] || "neutral"}">
            ${run.status === "building" ? '<span class="spinner"></span>' : ""}${esc(run.status)}
          </span>
        </div>
        <div class="item-meta">${esc(run.serving_model)}${run.adapter_hash ? " · adapter " + esc(run.adapter_hash) : ""}${run.chunk_count_used ? " · " + run.chunk_count_used + " chunks" : ""}</div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${run.progress ?? 0}%"></div></div>
        ${(run.build_steps || []).length ? `<div class="build-steps">${(run.build_steps || []).map(s => `<div class="build-step"><b>${esc(s.label)}:</b> ${esc(s.detail)}</div>`).join("")}</div>` : ""}
        ${run.error ? `<div style="color:var(--danger);font-size:12px;margin-top:8px">${esc(run.error)}</div>` : ""}
      </div>
    `).join("");
    lucide.createIcons({ nodes: [list] });
  }

  const sel = document.getElementById("eval-run-select");
  const usable = runs.filter(r => r.status !== "failed");
  sel.innerHTML = usable.length
    ? usable.map(r => `<option value="${r.id}">${esc(r.name)} (${esc(r.status)})</option>`).join("")
    : `<option value="">No runs yet</option>`;

  const anyActive = runs.some(r => r.status === "queued" || r.status === "building");
  if (anyActive && !runPollHandle) {
    runPollHandle = setInterval(renderRuns, 1500);
  } else if (!anyActive && runPollHandle) {
    clearInterval(runPollHandle);
    runPollHandle = null;
  }
}

// ===================================================
// EVALUATIONS
// ===================================================

document.getElementById("eval-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const runId = form.get("run_id");
  if (!runId) return showToast("Build an adapter run first.", "warn");
  try {
    await api("/evaluations", { method: "POST", body: JSON.stringify({ run_id: runId }) });
    showToast("Evaluation queued. Takes a few minutes on CPU.", "info");
    await refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
});

async function cancelEval(evalId) {
  if (!confirm("Cancel this evaluation? It cannot be resumed.")) return;
  try {
    await api(`/evaluations/${evalId}/cancel`, { method: "POST" });
    showToast("Evaluation cancelled.", "warn");
    refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
}

let evalPollHandle = null;

function evalStageText(pct) {
  if (pct <= 0)  return "Waiting to start…";
  if (pct < 15)  return "Loading model on CPU…";
  if (pct < 20)  return "Preparing dataset…";
  if (pct < 50)  return "Running base model calls…";
  if (pct < 85)  return "Running adapted model calls…";
  if (pct < 95)  return "Scoring results…";
  return "Finalising report…";
}

function buildEvalCardHTML(ev) {
  const badgeMap = { queued:"neutral", running:"warn", completed:"ok", failed:"bad" };
  const results  = ev.results || {};
  const cases    = results.adapted_model_results || [];
  const gateLabel = ev.status !== "completed" ? esc(ev.status)
    : ev.gate_pass ? "Gate: PASS" : "Gate: BLOCKED";
  const gateCls  = ev.status !== "completed" ? badgeMap[ev.status] || "neutral"
    : ev.gate_pass ? "ok" : "bad";
  const pct      = ev.progress ?? 0;
  const isActive = ev.status === "running" || ev.status === "queued";

  const progressBlock = isActive ? `
    <div class="eval-prog-row">
      <div class="progress-bar" style="flex:1"><div class="progress-bar-fill" id="eprog-${ev.id}" style="width:${pct}%"></div></div>
      <span class="eval-pct-lbl" id="epct-${ev.id}">${pct}%</span>
    </div>
    <div class="eval-stage-txt" id="estxt-${ev.id}">${evalStageText(pct)}</div>
    ${ev.status === "running" ? `<div class="item-actions"><button class="btn-danger btn-sm" onclick="cancelEval('${ev.id}')">Cancel</button></div>` : ""}
  ` : "";

  const caseRows = cases.length ? `
    <div class="case-list">
      ${cases.map(c => `
        <div class="case-row">
          <div class="case-info">
            <div class="case-label">${esc(c.id)} · ${esc(c.category || "")} · ${esc(c.severity || "")}</div>
            <div class="case-response">${esc((c.response || "").slice(0, 160))}${(c.response || "").length > 160 ? "…" : ""}</div>
          </div>
          <span class="badge ${c.passed ? "ok" : "bad"}">${c.passed ? "Pass" : "Fail"}</span>
        </div>
      `).join("")}
    </div>` : "";

  return `
    <div class="item-card" data-eval-id="${ev.id}" data-eval-status="${ev.status}">
      <div class="item-head">
        <span class="item-title">Evaluation <span class="td-mono">${esc(ev.id)}</span></span>
        <span class="badge ${gateCls}">${isActive ? '<span class="spinner"></span>' : ""}${gateLabel}</span>
      </div>
      <div class="item-meta">run: ${esc(ev.run_id)}${results.adapted_pass_rate ? " · adapted: " + esc(results.adapted_pass_rate) + " · base: " + esc(results.base_pass_rate) : ""}</div>
      ${progressBlock}
      ${ev.error ? `<div style="color:var(--danger);font-size:12px;margin-top:8px">${esc(ev.error)}</div>` : ""}
      ${caseRows}
    </div>`;
}

async function renderEvaluations() {
  let evals;
  try { evals = await api("/evaluations"); }
  catch { evals = []; }

  const list = document.getElementById("eval-list");
  const anyActive = evals.some(e => e.status === "queued" || e.status === "running");

  if (!evals.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="shield-check"></i>No evaluations run yet. Each one calls the live model twice per test case — takes a few minutes on CPU.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    // Surgical update path: if same eval IDs already in DOM and eval is running,
    // only update the progress bar + % text — no innerHTML swap, no blink
    const existingIds = [...list.querySelectorAll("[data-eval-id]")].map(el => el.dataset.evalId);
    const newIds      = evals.map(e => e.id);
    const canPatch    = anyActive && existingIds.length === newIds.length && newIds.every((id, i) => existingIds[i] === id);

    if (canPatch) {
      evals.filter(e => e.status === "running" || e.status === "queued").forEach(ev => {
        const pct    = ev.progress ?? 0;
        const progEl = document.getElementById("eprog-" + ev.id);
        const pctEl  = document.getElementById("epct-"  + ev.id);
        const txtEl  = document.getElementById("estxt-" + ev.id);
        if (progEl) progEl.style.width    = pct + "%";
        if (pctEl)  pctEl.textContent     = pct + "%";
        if (txtEl)  txtEl.textContent     = evalStageText(pct);
      });
    } else {
      list.innerHTML = evals.map(buildEvalCardHTML).join("");
      lucide.createIcons({ nodes: [list] });
    }
  }

  // Populate registry eval select — only passed evaluations
  const sel = document.getElementById("registry-eval-select");
  const passed = evals.filter(e => e.status === "completed" && e.gate_pass === true);
  sel.innerHTML = passed.length
    ? passed.map(ev => `<option value="${ev.id}" data-run-id="${ev.run_id}">${esc(ev.id)} — Pass (run: ${esc(ev.run_id)})</option>`).join("")
    : `<option value="">No passed evaluations yet</option>`;

  if (anyActive && !evalPollHandle) {
    evalPollHandle = setInterval(renderEvaluations, 1200);
  } else if (!anyActive && evalPollHandle) {
    clearInterval(evalPollHandle);
    evalPollHandle = null;
  }
}

// ===================================================
// REGISTRY
// ===================================================

document.getElementById("registry-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const evalId = form.get("evaluation_id");
  if (!evalId) return showToast("Run a passing evaluation first.", "warn");
  const evalSel = document.getElementById("registry-eval-select");
  const runId   = evalSel.options[evalSel.selectedIndex]?.dataset?.runId || "";
  try {
    await api("/registry", {
      method: "POST",
      body: JSON.stringify({
        evaluation_id: evalId,
        run_id:        runId,
        owner:         form.get("owner") || "unassigned"
      })
    });
    e.target.reset();
    showToast("Model registered.", "ok");
    await refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
});

function copyText(txt) {
  navigator.clipboard?.writeText(txt).then(() => showToast("Copied to clipboard.", "ok")).catch(() => {});
}

async function renderRegistry() {
  let entries;
  try { entries = await api("/registry"); }
  catch { entries = []; }

  const countBadge = document.getElementById("registry-count-badge");
  if (countBadge) {
    const promoted = entries.filter(m => m.status === "promoted").length;
    countBadge.innerHTML = `<i data-lucide="library"></i> ${entries.length} registered · ${promoted} promoted`;
    lucide.createIcons({ nodes: [countBadge] });
  }

  const list = document.getElementById("registry-list");
  if (!entries.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="library"></i>No registered models yet. Pass an evaluation gate first.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    // Newest first — reverse so most recently registered is at top
    const sorted = entries.slice().reverse();
    list.innerHTML = sorted.map((m, idx) => {
      const hash  = m.model_card?.adapter_hash || m.adapter_hash || m.id;
      const owner = m.model_card?.owner || "unassigned";
      const isNewest = idx === 0;
      return `
      <div class="model-card${isNewest ? " model-card-recent" : ""}">
        ${isNewest ? '<div class="recent-banner"><i data-lucide="sparkles"></i> Most Recent</div>' : ""}
        <div class="model-head">
          <div class="model-icon"><i data-lucide="bot"></i></div>
          <div><div class="model-name">${esc(m.version)}</div>
          <div class="model-hash">${esc(String(hash).slice(0, 16))}… <button class="copy-btn" onclick="copyText('${esc(hash)}')" title="Copy hash"><i data-lucide="copy"></i></button></div></div>
        </div>
        <div class="model-badges">
          <span class="badge ${m.status === "promoted" ? "ok" : "neutral"}">${esc((m.status || "registered").toUpperCase())}</span>
          <span class="badge blue">EVAL PASSED</span>
        </div>
        <div class="model-row"><i data-lucide="user"></i> Owner: <b>${esc(owner)}</b></div>
        <div class="model-row"><i data-lucide="git-commit-horizontal"></i> Run: <b>${esc(m.run_id)}</b></div>
        <div class="model-row"><i data-lucide="calendar"></i> Expiry: <b>${esc(m.model_card?.expiry_date || "—")}</b></div>
        ${m.status !== "promoted" ? `<div class="item-actions"><button onclick="promoteModel('${m.id}')"><i data-lucide="rocket"></i> Promote &amp; Deploy</button></div>` : ""}
      </div>`;
    }).join("");
    lucide.createIcons({ nodes: [list] });
  }

  // Populate deploy-registry-select
  const deploySel = document.getElementById("deploy-registry-select");
  if (deploySel) {
    const promotable = entries.filter(m => m.status !== "promoted");
    deploySel.innerHTML = promotable.length
      ? promotable.map(m => `<option value="${m.id}">${esc(m.version)} (${esc(m.status)})</option>`).join("")
      : `<option value="">No undeployed registry models</option>`;
  }
}

async function promoteModel(modelId) {
  try {
    await api(`/registry/${modelId}/promote`, { method: "POST" });
    showToast("Model promoted to canary deployment.", "ok");
    refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
}

const promoteBtn = document.getElementById("promote-btn");
if (promoteBtn) {
  promoteBtn.addEventListener("click", async () => {
    const sel = document.getElementById("deploy-registry-select");
    const modelId = sel?.value;
    if (!modelId) return showToast("Select a registry model first.", "warn");
    await promoteModel(modelId);
  });
}

// ===================================================
// DEPLOYMENTS
// ===================================================

async function expandDeploy(depId) {
  try {
    await api(`/deployments/${depId}/expand`, { method: "POST" });
    showToast("Traffic expanded +10%.", "ok");
    refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
}

async function rollbackDeploy(depId) {
  if (!confirm("Roll back this deployment to 0% traffic?")) return;
  try {
    await api(`/deployments/${depId}/rollback`, { method: "POST" });
    showToast("Deployment rolled back.", "warn");
    refreshAll();
  } catch (err) { showToast(err.message, "bad"); }
}

function renderDeploySummary(deps) {
  const row = document.getElementById("deploy-summary-row");
  if (!row) return;
  const active = deps.filter(d => d.status !== "rolled_back");
  const rolledBack = deps.filter(d => d.status === "rolled_back").length;
  const maxTraffic = Math.max(0, ...active.map(d => d.traffic_pct || 0));
  const cards = [
    { label:"Active Deployments", html:`<div class="s-value">${active.length}</div>`, c:"var(--blue)" },
    { label:"Peak Traffic", html:`<div class="s-value">${maxTraffic}%</div><div class="traffic-mini"><span style="width:${maxTraffic}%"></span></div>`, c:"var(--teal)" },
    { label:"Total Deployments", html:`<div class="s-value">${deps.length}</div>`, c:"var(--purple)" },
    { label:"Rollbacks", html:`<div class="s-value" style="color:${rolledBack ? "var(--warn)" : "inherit"}">${rolledBack}</div>`, c:"var(--warn)" }
  ];
  row.innerHTML = cards.map((c, i) => `
    <div class="summary-card" style="--c:${c.c};animation-delay:${i * 0.05}s">
      <div class="s-label">${c.label}</div>${c.html}
    </div>`).join("");
}

async function renderDeployments() {
  let deps;
  try { deps = await api("/deployments"); }
  catch { deps = []; }

  renderDeploySummary(deps);

  const list = document.getElementById("deployment-list");
  if (!deps.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="rocket"></i>No deployments yet. Register a model, then promote it.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    const edgeMap  = { canary:"edge-warn", active:"edge-ok", rolled_back:"edge-bad" };
    const badgeMap = { canary:"warn",      active:"ok",      rolled_back:"bad" };
    // Newest first; most recent non-rolled-back gets green "recent" highlight
    const sorted   = deps.slice().reverse();
    const newestActiveIdx = sorted.findIndex(d => d.status !== "rolled_back");
    list.innerHTML = sorted.map((d, idx) => {
      const isRecent = idx === newestActiveIdx;
      return `
      <div class="item-card ${isRecent ? "edge-ok dep-recent" : edgeMap[d.status] || ""}">
        ${isRecent ? '<div class="recent-banner green"><i data-lucide="zap"></i> Latest Deployment</div>' : ""}
        <div class="item-head">
          <span class="item-title"><i data-lucide="rocket"></i> ${esc(d.endpoint_name || d.id)}</span>
          <span class="badge ${badgeMap[d.status] || "neutral"}">${esc(d.status)}</span>
        </div>
        <div class="item-meta">model: ${esc(d.model_id)} · traffic: ${d.traffic_pct ?? 0}%</div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${d.traffic_pct ?? 0}%"></div></div>
        ${d.status !== "rolled_back" ? `
          <div class="item-actions">
            <button onclick="expandDeploy('${d.id}')"><i data-lucide="trending-up"></i> Expand +10%</button>
            <button onclick="rollbackDeploy('${d.id}')" style="color:var(--danger)"><i data-lucide="undo-2"></i> Rollback</button>
          </div>` : ""}
      </div>`;
    }).join("");
    lucide.createIcons({ nodes: [list] });
  }

  // Populate playground deployment select — preserve user's current selection
  const sel     = document.getElementById("infer-deployment-select");
  const prevVal = sel ? sel.value : "";
  const active  = deps.filter(d => d.status !== "rolled_back");
  if (sel) {
    sel.innerHTML =
      `<option value="">Base model — no deployment, no banking context</option>` +
      active.map(d => `<option value="${d.id}">${esc(d.endpoint_name || d.id)} (${esc(d.status)})</option>`).join("");
    if (prevVal) sel.value = prevVal; // restore user's selection
  }
}

// ===================================================
// PLAYGROUND — CHAT
// ===================================================

const CHAT_KEY = "hdfc_conversations";
let currentConvId = null;

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); }
  catch { return []; }
}
function saveConversations(convs) {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(convs.slice(-40))); } catch(_) {}
}
function getConv(id) { return loadConversations().find(c => c.id === id); }

function saveConversation(id, messages) {
  const convs = loadConversations();
  const idx   = convs.findIndex(c => c.id === id);
  const title = (messages.find(m => m.role === "user")?.content || "New chat").slice(0, 60);
  const conv  = { id, title, messages, time: Date.now() };
  if (idx >= 0) convs[idx] = conv; else convs.push(conv);
  saveConversations(convs);
}

function renderConversationList() {
  const el = document.getElementById("conversation-list");
  if (!el) return;
  const convs = loadConversations().slice().reverse();
  if (!convs.length) {
    el.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);padding:8px 4px;text-align:center">No saved chats yet</div>`;
    return;
  }
  el.innerHTML = convs.map(c => `
    <div class="conv-item ${c.id === currentConvId ? "active" : ""}" onclick="openConversation('${c.id}')">
      <div class="conv-preview">${esc(c.title)}</div>
      <div class="conv-time">${new Date(c.time).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
      <button class="conv-del" onclick="event.stopPropagation();deleteConversation('${c.id}')" title="Delete"><i data-lucide="trash-2"></i></button>
    </div>`).join("");
  lucide.createIcons({ nodes: [el] });
}

function newConversation() {
  currentConvId = "conv-" + Date.now();
  renderChatMessages([]);
  renderConversationList();
  resetRetrieval();
}

function openConversation(id) {
  const conv = getConv(id);
  if (!conv) return;
  currentConvId = id;
  renderChatMessages(conv.messages);
  renderConversationList();
  const lastBot = conv.messages.slice().reverse().find(m => m.role === "bot" && m.meta);
  if (lastBot?.meta) renderRetrieval(lastBot.meta); else resetRetrieval();
}

function deleteConversation(id) {
  saveConversations(loadConversations().filter(c => c.id !== id));
  if (currentConvId === id) newConversation();
  else renderConversationList();
  showToast("Conversation deleted.", "info");
}

function currentMessages() {
  const conv = currentConvId ? getConv(currentConvId) : null;
  return conv ? conv.messages.slice() : [];
}

function renderChatMessages(messages) {
  const el = document.getElementById("chat-messages");
  if (!el) return;
  if (!messages.length) {
    el.innerHTML = `
      <div class="chat-empty">
        <div class="ce-logo">H</div>
        <h3>HDFC Banking Assistant</h3>
        <p>Ask about loans, KYC, fixed deposits, fraud, UPI, and more.<br>Responses are grounded in approved policy documents.</p>
      </div>`;
    return;
  }
  el.innerHTML = messages.map(renderMessageHTML).join("");
  lucide.createIcons({ nodes: [el] });
  el.scrollTop = el.scrollHeight;
}

/* Strip incomplete trailing content from model responses before displaying */
function trimIncomplete(text) {
  if (!text) return text;
  // Remove inline "Source:" lines the model appends (grounding artifact)
  text = text.replace(/\n+Source:[\s\S]*/i, "").trimEnd();
  // Try double-newline paragraphs first
  const paras = text.split(/\n\n+/);
  if (paras.length >= 2) {
    const last = paras[paras.length - 1].trimEnd();
    if (!/[.!?:"\)\*]$/.test(last)) {
      return paras.slice(0, -1).join("\n\n").trimEnd();
    }
    return text;
  }
  // Single paragraph — split by single newlines
  const lines = text.split("\n");
  if (lines.length >= 2) {
    const last = lines[lines.length - 1].trimEnd();
    if (!/[.!?:"\)\*]$/.test(last)) {
      return lines.slice(0, -1).join("\n").trimEnd();
    }
  }
  return text;
}

function renderMessageHTML(m) {
  if (m.role === "user") {
    const initial = (JSON.parse(sessionStorage.getItem(USER_KEY) || "{}").name || "A")[0].toUpperCase();
    return `<div class="msg user"><div class="msg-avatar">${esc(initial)}</div><div class="msg-bubble">${esc(m.content)}</div></div>`;
  }
  const meta    = m.meta || {};
  const content = trimIncomplete(m.content || "");
  const badges  = [];
  if (meta.escalation_required)  badges.push(`<span class="badge warn">Escalation required</span>`);
  if (meta.guardrail_blocked)     badges.push(`<span class="badge bad">Blocked: ${esc(meta.guardrail_category || "unknown")}</span>`);
  else if (meta.guardrail_category && meta.guardrail_category !== "general")
    badges.push(`<span class="badge neutral">${esc(meta.guardrail_category)}</span>`);
  let cite = "";
  if (meta.citations?.length) {
    const names = meta.citations.map(c => {
      const parts = String(c || "").replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || c;
    });
    cite = `<div class="msg-cite">Sources: ${esc(names.join(" · "))}</div>`;
  }
  let info = "";
  if (meta.served_by) {
    const name = String(meta.served_by).split(" (")[0].split(" via ")[0];
    const ms = meta.latency_ms ?? 0;
    const lat = ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms";
    info = `<div class="msg-footer">${esc(name)} · ${lat}</div>`;
  }
  return `<div class="msg bot"><div class="msg-avatar">H</div><div class="msg-bubble">${esc(content)}${badges.length ? `<div class="msg-badges">${badges.join("")}</div>` : ""}${cite}${info}</div></div>`;
}

function showGenerationIndicator() {
  const el   = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.id        = "gen-indicator";
  wrap.innerHTML = `<div class="msg-avatar">H</div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  el.appendChild(wrap);
  el.scrollTop = el.scrollHeight;
  return wrap;
}

function resetRetrieval() {
  const g = document.getElementById("confidence-gauge");
  const e = document.getElementById("retrieval-empty");
  const s = document.getElementById("sources-list");
  if (g) g.style.display = "none";
  if (s) s.innerHTML = "";
  if (e) e.style.display = "block";
}

function renderRetrieval(meta) {
  const gaugeEl = document.getElementById("confidence-gauge");
  const emptyEl = document.getElementById("retrieval-empty");
  const srcList = document.getElementById("sources-list");
  const chunks  = meta.retrieved_chunks || [];
  if (!chunks.length && meta.confidence == null) { resetRetrieval(); return; }
  if (emptyEl) emptyEl.style.display = "none";
  if (gaugeEl) {
    const conf   = Math.min(100, meta.confidence ?? 0);
    const color  = conf >= 70 ? "#10b981" : conf >= 40 ? "#f59e0b" : "#ef4444";
    const r = 52, circ = 2 * Math.PI * r, offset = circ * (1 - conf / 100);
    gaugeEl.style.display = "flex";
    gaugeEl.innerHTML = `
      <div class="gauge-ring">
        <svg width="120" height="120">
          <circle class="gauge-track" cx="60" cy="60" r="${r}"></circle>
          <circle class="gauge-fill" cx="60" cy="60" r="${r}" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle>
        </svg>
        <div class="gauge-label"><div class="gauge-val">${conf.toFixed(0)}%</div><div class="gauge-cap">Confidence</div></div>
      </div>
      <span class="latency-pill">${meta.latency_ms ?? 0} ms · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}</span>`;
    requestAnimationFrame(() => {
      const fill = gaugeEl.querySelector(".gauge-fill");
      if (fill) fill.style.strokeDashoffset = offset;
    });
  }
  if (srcList) {
    srcList.innerHTML = chunks.length
      ? chunks.map((chunk, i) => `<div class="source-chunk"><div class="source-tag">SOURCE ${i+1}</div>${esc(String(chunk).slice(0, 300))}${String(chunk).length > 300 ? "…" : ""}</div>`).join("")
      : `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px">No sources retrieved.</div>`;
  }
}

async function sendInference() {
  const input  = document.getElementById("chat-input");
  const prompt = input.value.trim();
  if (!prompt) return;
  const sendBtn      = document.getElementById("chat-send-btn");
  const deploymentId = document.getElementById("infer-deployment-select")?.value || null;

  if (!currentConvId) currentConvId = "conv-" + Date.now();
  const messages = currentMessages();
  messages.push({ role: "user", content: prompt });
  renderChatMessages(messages);
  saveConversation(currentConvId, messages);
  renderConversationList();

  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;
  const indicator = showGenerationIndicator();

  try {
    const result = await api("/inference", {
      method: "POST",
      body: JSON.stringify({ deployment_id: deploymentId, prompt })
    });
    indicator.remove();
    const meta = {
      confidence: result.confidence, latency_ms: result.latency_ms,
      served_by: result.served_by, escalation_required: result.escalation_required,
      guardrail_blocked: result.guardrail_blocked, guardrail_category: result.guardrail_category,
      citations: result.citations, retrieved_chunks: result.retrieved_chunks
    };
    messages.push({ role: "bot", content: result.answer || "No response received.", meta });
    renderChatMessages(messages);
    saveConversation(currentConvId, messages);
    renderConversationList();
    renderRetrieval(meta);
    renderMonitoring();
  } catch (err) {
    indicator.remove();
    messages.push({ role: "bot", content: "Request failed: " + err.message, meta: {} });
    renderChatMessages(messages);
    saveConversation(currentConvId, messages);
    showToast(err.message, "bad");
  } finally {
    sendBtn.disabled = false;
  }
}

// Chat input wiring
const chatInput = document.getElementById("chat-input");
const chatSend  = document.getElementById("chat-send-btn");
if (chatInput) {
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(140, chatInput.scrollHeight) + "px";
  });
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInference(); }
  });
}
if (chatSend) chatSend.addEventListener("click", sendInference);
document.getElementById("new-chat-btn")?.addEventListener("click", newConversation);
document.getElementById("clear-chat-btn")?.addEventListener("click", () => { newConversation(); showToast("Chat cleared.", "info"); });

function toggleSources() {
  const shell = document.querySelector(".chat-shell");
  const btn   = document.getElementById("toggle-sources-btn");
  if (!shell || !btn) return;
  const hidden = shell.classList.toggle("sources-hidden");
  btn.classList.toggle("active", !hidden);
  btn.title = hidden ? "Show Sources" : "Hide Sources";
  btn.innerHTML = hidden
    ? '<i data-lucide="eye-off"></i><span>Sources</span>'
    : '<i data-lucide="eye"></i><span>Sources</span>';
  lucide.createIcons({ nodes: [btn] });
}
document.getElementById("toggle-sources-btn")?.addEventListener("click", toggleSources);

// Quick chips
const QUICK_CHIPS = ["Loan eligibility", "KYC requirements", "FD rules", "Savings account", "Credit card", "UPI limits", "Report fraud", "ATM issue"];
function renderQuickChips() {
  const el = document.getElementById("quick-chips");
  if (!el) return;
  el.innerHTML = QUICK_CHIPS.map(c => `<button class="chip" type="button">${esc(c)}</button>`).join("");
  el.querySelectorAll(".chip").forEach(btn => btn.addEventListener("click", () => {
    const inp = document.getElementById("chat-input");
    if (!inp) return;
    inp.value = btn.textContent;
    inp.focus();
    inp.dispatchEvent(new Event("input"));
  }));
}

// ===================================================
// MONITORING
// ===================================================

async function renderMonitoring() {
  let mon;
  try { mon = await api("/monitoring"); }
  catch { mon = {}; }

  const latMs    = mon.avg_latency_ms ?? 0;
  const latLabel = latMs >= 1000 ? (latMs / 1000).toFixed(2) + " s" : Math.round(latMs) + " ms";
  const avgConf  = Math.min(100, mon.avg_confidence ?? 0);

  const kpis = [
    { label:"Total Inferences", value: mon.total_requests ?? 0, icon:"activity",       grad:"var(--grad-blue)",  color:"var(--blue)" },
    { label:"Avg Confidence",   value: avgConf, suffix:"%",      icon:"bar-chart-2",    grad:"var(--grad-green)", color:"var(--ok)" },
    { label:"Guardrail Hits",   value: Object.values(mon.guardrail_breakdown || {}).reduce((a, b) => a + b, 0), icon:"shield", grad:"var(--grad-amber)", color:"var(--warn)" },
    { label:"Avg Latency",      value: latLabel, icon:"clock",   grad:"var(--grad-purple)", color:"var(--purple)", raw:true }
  ];

  const kpiEl = document.getElementById("monitoring-kpis");
  if (kpiEl) {
    kpiEl.innerHTML = kpis.map((k, i) => `
      <div class="kpi-card" style="--card-color:${k.color};--card-grad:${k.grad};--delay:${i * 0.05}s">
        <div class="kpi-icon"><i data-lucide="${k.icon}"></i></div>
        <div class="kpi-value" ${k.raw ? "" : `data-target="${k.value}" data-suffix="${k.suffix || ""}"`}>${k.raw ? esc(k.value) : "0"}</div>
        <div class="kpi-label">${esc(k.label)}</div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [kpiEl] });
    kpiEl.querySelectorAll(".kpi-value[data-target]").forEach(el => animateCount(el, parseFloat(el.dataset.target) || 0, el.dataset.suffix));
  }

  const breakdown = mon.guardrail_breakdown || {};
  const gbEl = document.getElementById("guardrail-breakdown");
  if (gbEl) {
    const entries = Object.entries(breakdown);
    if (!entries.length) {
      gbEl.innerHTML = `<div class="empty-state"><i data-lucide="shield-check"></i>No guardrail events recorded yet. The serving layer is clear.</div>`;
      lucide.createIcons({ nodes: [gbEl] });
    } else {
      const max = Math.max(...entries.map(([, v]) => v), 1);
      gbEl.innerHTML = entries.map(([cat, count]) => `
        <div class="guardrail-row">
          <span class="guardrail-label">${esc(cat.replace(/_/g, " "))}</span>
          <div class="guardrail-bar-wrap"><div class="guardrail-bar" style="width:${Math.round((count / max) * 100)}%"></div></div>
          <span class="guardrail-count">${count}</span>
        </div>
      `).join("");
    }
  }
}

// ===================================================
// LAST UPDATED TIMESTAMP
// ===================================================

function updateTimestamp() {
  const el = document.getElementById("last-updated");
  if (!el) return;
  const now = new Date();
  el.textContent = "Updated " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ===================================================
// REFRESH ALL
// ===================================================

async function refreshAll() {
  try {
    await checkHealth();
    await Promise.all([
      renderDashboard(),
      renderDatasets(),
      renderRuns(),
      renderEvaluations(),
      renderRegistry(),
      renderDeployments(),
      renderMonitoring()
    ]);
    updateTimestamp();
    lucide.createIcons();
  } catch (err) {
    console.error("refreshAll error:", err);
  }
}

// ===================================================
// INIT
// ===================================================

let _booted = false;
function bootApp() {
  if (_booted) return;
  _booted = true;
  renderQuickChips();
  newConversation();
  refreshAll();
  setInterval(checkHealth, 10000);
  setInterval(refreshAll, 30000);
}

checkLogin();
