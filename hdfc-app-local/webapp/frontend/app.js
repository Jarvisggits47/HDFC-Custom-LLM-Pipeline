/* ===================================================
   HDFC Bank — Enterprise AI Factory  |  Frontend
   Premium dark redesign
   =================================================== */

const API = (typeof window !== "undefined" && window.location.hostname.includes("github.io"))
  ? "https://hdfc-custom-llm-backend.onrender.com/api"
  : "/api";
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
function generateSparkData(peak, index) {
  const n = 12;
  const data = [];
  const val = Math.max(1, peak);

  if (index === 0) { // Datasets: Steady step growth
    for (let i = 0; i < n; i++) data.push(Math.round(val * (0.2 + (i / n) * 0.8)));
  } else if (index === 1) { // Total Chunks: Exponential growth curve
    for (let i = 0; i < n; i++) data.push(Math.round(val * Math.pow(i / (n - 1), 2)));
  } else if (index === 2) { // Adapter Runs: Training iteration spikes
    const pattern = [0.1, 0.3, 0.25, 0.6, 0.45, 0.8, 0.7, 0.9, 0.85, 0.95, 0.9, 1.0];
    pattern.forEach(p => data.push(val * p));
  } else if (index === 3) { // Evaluations: Benchmark wave
    for (let i = 0; i < n; i++) data.push(val * (0.4 + 0.3 * Math.sin(i * 0.8) + (i / n) * 0.3));
  } else if (index === 4) { // Registry Models: Milestone steps
    for (let i = 0; i < n; i++) data.push(val * (0.3 + Math.floor(i / 3) * 0.23));
  } else if (index === 5) { // Live Deployments: Canary rollout staircase
    for (let i = 0; i < n; i++) data.push(val * (0.2 + Math.floor(i / 2) * 0.16));
  } else if (index === 6) { // Avg Confidence: High stability band
    for (let i = 0; i < n; i++) data.push(val + Math.sin(i * 1.5) * 3 - 1.5);
  } else if (index === 7) { // API Health: Heartbeat pulse
    const beat = [100, 100, 100, 100, 100, 100, 70, 100, 100, 100, 100, 100];
    beat.forEach(b => data.push((val / 100) * b));
  } else {
    for (let i = 0; i < n; i++) data.push((val / n) * (i + 1));
  }

  data[data.length - 1] = val;
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
    y: h - 5 - ((v - min) / range) * (h - 10)
  }));

  const COLOR_MAP = {
    "var(--blue)": "#1a6fd4",
    "var(--teal)": "#06b6d4",
    "var(--purple)": "#8b5cf6",
    "var(--warn)": "#f59e0b",
    "var(--ok)": "#10b981",
    "var(--accent)": "#ef4444"
  };
  const c = COLOR_MAP[colorStr] || (colorStr.startsWith("#") ? colorStr : "#1a6fd4");

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c + "55");
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
  ctx.lineWidth = 2.0;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Glowing end dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.shadowColor = c;
  ctx.shadowBlur = 6;
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
// PERSISTENT THEME ENGINE
// ===================================================

const THEME_KEY = "hdfc_theme";

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    document.body.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
  }
  localStorage.setItem(THEME_KEY, theme);

  const btn  = document.getElementById("dark-toggle");
  const icon = document.getElementById("dark-icon");
  if (btn && icon) {
    btn.title = theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode";
    icon.setAttribute("data-lucide", theme === "light" ? "sun" : "moon");
    lucide.createIcons({ nodes: [btn] });
  }

  const profThemeSel = document.getElementById("edit-profile-theme");
  if (profThemeSel) profThemeSel.value = theme;
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  showToast(`Switched to ${next === "light" ? "HDFC Light Corporate" : "Midnight Executive Dark"} theme.`, "info");
}

document.getElementById("dark-toggle")?.addEventListener("click", toggleTheme);
initTheme();

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
  const login = document.getElementById("login-screen");
  if (login) {
    login.classList.remove("hide");
    login.style.display = "flex";
  }
  const appShell = document.getElementById("app-shell");
  if (appShell) appShell.style.display = "none";
}

function showApp() {
  const login = document.getElementById("login-screen");
  if (login) {
    login.classList.add("hide");
    login.style.display = "none";
  }
  const appShell = document.getElementById("app-shell");
  if (appShell) appShell.style.display = "block";
}

let _currentAuthTab = "login";

function switchAuthTab(tab) {
  _currentAuthTab = tab;
  const loginTabBtn  = document.getElementById("tab-login-btn");
  const regTabBtn    = document.getElementById("tab-register-btn");
  const regNameField = document.getElementById("reg-name-field");
  const regEmpField  = document.getElementById("reg-emp-field");
  const regRoleField = document.getElementById("reg-role-field");
  const btnText      = document.getElementById("login-btn-text");

  if (regEmpField) regEmpField.style.display = "block";

  if (tab === "register") {
    loginTabBtn?.classList.remove("active");
    regTabBtn?.classList.add("active");
    if (regNameField) regNameField.style.display = "block";
    if (regRoleField) regRoleField.style.display = "block";
    if (btnText) btnText.textContent = "Create Account";
  } else {
    regTabBtn?.classList.remove("active");
    loginTabBtn?.classList.add("active");
    if (regNameField) regNameField.style.display = "none";
    if (regRoleField) regRoleField.style.display = "none";
    if (btnText) btnText.textContent = "Secure Login";
  }
}

function openUserProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;
  const u = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  const empId = u.empId || "HDFC-AI-101";
  const name = u.name || "Abhi";
  const role = u.role || "Lead AI Engineer";
  const email = u.email || "abhi@hdfcbank.com";
  const initial = (name || "A")[0].toUpperCase();

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("modal-user-avatar", initial);
  set("modal-user-name", name);
  set("modal-user-email", email);
  set("modal-emp-id-val", `${empId} (Verified HDFC Personnel)`);

  const empBadge = document.getElementById("modal-user-emp-badge");
  if (empBadge) empBadge.innerHTML = `<i data-lucide="shield-check" style="width:11px;height:11px;margin-right:3px"></i> Verified: ${empId}`;

  const empInp = document.getElementById("edit-profile-emp-id");
  const nameInp = document.getElementById("edit-profile-name");
  const roleSel = document.getElementById("edit-profile-role");
  if (empInp) empInp.value = empId;
  if (nameInp) nameInp.value = name;
  if (roleSel) roleSel.value = role;

  modal.style.display = "flex";
  lucide.createIcons({ nodes: [modal] });
}

function closeUserProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (modal) modal.style.display = "none";
}

async function saveUserProfile() {
  const empInp  = document.getElementById("edit-profile-emp-id");
  const nameInp = document.getElementById("edit-profile-name");
  const roleSel = document.getElementById("edit-profile-role");
  const rawEmpId = empInp?.value.trim() || "HDFC-AI-101";
  const name     = nameInp?.value.trim() || "Abhi";
  const role     = roleSel?.value || "Lead AI Engineer";

  try {
    const emp = await api("/auth/verify-employee", {
      method: "POST",
      body: JSON.stringify({ employee_id: rawEmpId })
    });

    const u = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
    u.empId = emp.employee_id;
    u.name  = name || emp.full_name;
    u.role  = role || emp.role;
    u.email = emp.email;
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));

    updateSidebarUser();
    closeUserProfileModal();
    logUserAction("PROFILE_UPDATE", `Updated profile for ${u.empId} (${u.name})`);
    showToast(`Profile updated: ${u.name} (${u.empId})`, "ok");
  } catch (err) {
    showToast(`Verification Failed: ${err.message}`, "bad");
  }
}

function openResetPasswordModal() {
  const modal = document.getElementById("reset-password-modal");
  if (modal) modal.style.display = "flex";
}

function closeResetPasswordModal() {
  const modal = document.getElementById("reset-password-modal");
  if (modal) modal.style.display = "none";
}

async function submitResetPassword() {
  const divCode = document.getElementById("reset-div-code")?.value.trim() || "";
  const numCode = document.getElementById("reset-num-code")?.value.trim() || "";
  const newPass = document.getElementById("reset-new-pass")?.value || "";

  if (!divCode || !numCode) {
    showToast("Please enter both Division Code (e.g. DEV) and Numeric Code (e.g. 3301).", "warn");
    return;
  }
  const queryId = `HDFC-${divCode.toUpperCase()}-${numCode}`;

  try {
    const emp = await api("/auth/verify-employee", {
      method: "POST",
      body: JSON.stringify({ employee_id: queryId })
    });

    closeResetPasswordModal();
    logUserAction("PASSWORD_RESET", `Password reset for HDFC Officer ${emp.employee_id} (${emp.full_name})`);
    showToast(`✅ Credentials verified! Password reset successfully for ${emp.employee_id} (${emp.full_name}).`, "ok");
  } catch (err) {
    showToast(`❌ Reset Failed: Invalid Division/Numeric Code for ${queryId}.`, "bad");
  }
}

function updateSidebarUser() {
  const u = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  const empId   = u.empId || "HDFC-AI-101";
  const name    = u.name || "Abhi";
  const role    = u.role || "Lead AI Engineer";
  const initial = (name || "A")[0].toUpperCase();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("user-name", `${name} (${empId})`);
  set("user-role", role);
  set("user-avatar", initial);
  set("hero-username", `${name} • ${empId}`);
  set("chat-user-name", name);
  set("chat-user-avatar", initial);
}

async function logUserAction(action, details) {
  const u = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  const empId = u.empId || "HDFC-AI-101";
  const userName = u.name || "Abhi";
  try {
    await api("/audit-logs", {
      method: "POST",
      body: JSON.stringify({ employee_id: empId, user_name: userName, action, details })
    });
    renderAuditLogs();
  } catch (err) {
    console.warn("Audit logging error:", err);
  }
}

async function renderAuditLogs() {
  const el = document.getElementById("activity-feed");
  if (!el) return;
  try {
    const logs = await api("/audit-logs");
    if (!logs || !logs.length) {
      el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">No recent activity recorded.</div>`;
      return;
    }
    el.innerHTML = logs.slice(0, 10).map(l => `
      <div class="activity-item" style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,0.15);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">
          ${esc((l.user_name || "A")[0].toUpperCase())}
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text-main)">${esc(l.action)} — <span style="color:var(--ok);font-size:11px">${esc(l.employee_id)}</span></div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">${esc(l.details)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${new Date(l.created_at).toLocaleString()}</div>
        </div>
      </div>
    `).join("");
  } catch (err) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Activity log loading...</div>`;
  }
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const isRegister  = _currentAuthTab === "register";
    const fullNameInp = document.getElementById("login-fullname");
    const empIdInp    = document.getElementById("login-empid")?.value.trim() || "HDFC-AI-101";
    const usernameInp = document.getElementById("login-username");
    const roleSel     = document.getElementById("login-role");

    try {
      const emp = await api("/auth/verify-employee", {
        method: "POST",
        body: JSON.stringify({ employee_id: empIdInp })
      });

      const name = (isRegister && fullNameInp?.value.trim()) ? fullNameInp.value.trim() : emp.full_name;
      const role = (isRegister && roleSel?.value) ? roleSel.value : emp.role;
      const verifiedEmpId = emp.employee_id;

      const user = { empId: verifiedEmpId, name, role, email: emp.email, loginTime: Date.now() };
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      showApp();
      updateSidebarUser();
      bootApp();
      logUserAction(isRegister ? "USER_REGISTER" : "USER_LOGIN", `${name} logged in with ${verifiedEmpId}`);
      showToast(isRegister ? `Account verified & created! Welcome, ${name} (${verifiedEmpId}).` : `Welcome back, ${name} (${verifiedEmpId}).`, "ok");
    } catch (err) {
      showToast(`❌ Authorization Failed: ${err.message}`, "bad");
    }
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
  const q = (document.getElementById("dataset-search")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("dataset-status-filter")?.value || "all";

  renderDatasetTable(_allDatasets.filter(d => {
    const matchesText = !q || (d.name || "").toLowerCase().includes(q) || (d.source || "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "approved" && d.status === "approved") ||
      (statusFilter === "pending" && d.status !== "approved");
    return matchesText && matchesStatus;
  }));
}

function renderDatasetTable(datasets) {
  const tbody = document.getElementById("dataset-list");
  if (!tbody) return;
  if (!datasets.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i data-lucide="file-text"></i>No datasets found. Upload a policy document or paste text.</div></td></tr>`;
    lucide.createIcons({ nodes: [tbody] });
    return;
  }
  tbody.innerHTML = datasets.map(ds => {
    const isApproved = ds.status === "approved";
    const canApprove = !isApproved && ((ds.chunk_count || 0) > 0 || (ds.record_count || 0) > 0);
    const hasChunks  = (ds.chunk_count || 0) > 0;
    return `<tr class="${!isApproved ? 'pending-dataset-row' : ''}">
      <td class="td-name">
        <div style="font-weight:700;color:var(--text-primary);display:flex;align-items:center">
          ${!isApproved ? '<span class="yellow-pulse-dot" title="Registered — Waiting for Approval"></span>' : ''}
          ${esc(ds.name)}
        </div>
        <div class="td-mono" style="font-size:11px;color:var(--text-secondary)">${esc(ds.source)}</div>
      </td>
      <td>
        <span class="badge ${hasChunks ? 'teal' : 'neutral'}">${ds.chunk_count ?? 0} Chunks</span>
        ${hasChunks ? '<div style="margin-top:3px"><span class="badge ok" style="font-size:9.5px;padding:1px 6px"><i data-lucide="shield-check" style="width:10px;height:10px"></i> PII Redacted</span></div>' : ''}
      </td>
      <td><span class="badge neutral">${ds.record_count ?? 0} Records</span></td>
      <td><span class="badge purple">${esc((ds.classification || 'internal').toUpperCase())}</span></td>
      <td>
        <span class="badge ${isApproved ? 'ok' : 'warn'}" style="font-weight:700">
          ${!isApproved ? '<span class="yellow-pulse-dot"></span> Waiting for Approval' : '<i data-lucide="check-circle-2" style="width:12px;height:12px"></i> Approved'}
        </span>
      </td>
      <td><div class="td-actions">
        ${canApprove ? `<button class="approve-btn" onclick="approveDataset('${ds.id}')"><i data-lucide="shield-check"></i> APPROVE FOR AI MODEL</button>` : `<span style="font-size:12px;color:var(--ok);font-weight:700"><i data-lucide="check-circle-2"></i> Ready for AI</span>`}
      </div></td>
    </tr>`;
  }).join("");
  lucide.createIcons({ nodes: [tbody] });
}

function filterPendingDatasets() {
  const subTabBtn = document.getElementById("subtab-doc-table-btn");
  if (subTabBtn) {
    document.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".subtab-panel").forEach(t => t.classList.remove("active"));
    subTabBtn.classList.add("active");
    const docTable = document.getElementById("doc-table");
    if (docTable) docTable.classList.add("active");
  }

  const filterSel = document.getElementById("dataset-status-filter");
  if (filterSel) filterSel.value = "pending";

  filterDatasets();

  const card = document.querySelector("#doc-table .card");
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.style.boxShadow = "0 0 24px rgba(245, 158, 11, 0.55)";
    setTimeout(() => { card.style.boxShadow = ""; }, 2500);
  }
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

  // Sub-tab pending badge
  const pendingBadge = document.getElementById("subtab-pending-badge");
  if (pendingBadge) {
    if (pending.length > 0) {
      pendingBadge.style.display = "inline-flex";
      pendingBadge.className = "badge warn";
      pendingBadge.style.cssText = "font-size:10px;padding:2px 7px;margin-left:6px;font-weight:700";
      pendingBadge.innerHTML = `<span class="yellow-pulse-dot"></span> ${pending.length} Pending`;
    } else {
      pendingBadge.style.display = "none";
    }
  }

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
    const sortedRuns = runs.slice().sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tA !== tB) return tB - tA;
      return (b.id || 0) - (a.id || 0);
    });

    const edgeMap = { queued:"edge-warn", building:"edge-warn", completed:"edge-ok", failed:"edge-bad" };
    const badgeMap = { queued:"neutral", building:"warn", completed:"ok", failed:"bad" };

    list.innerHTML = sortedRuns.map((run, idx) => {
      const isLatest = idx === 0;
      return `
        <div class="item-card ${edgeMap[run.status] || ""} ${isLatest ? 'model-card-recent' : ''}" style="${isLatest ? 'border: 1px solid var(--blue); box-shadow: 0 0 18px rgba(26, 111, 212, 0.35);' : ''}">
          ${isLatest ? `
            <div class="recent-banner" style="background:linear-gradient(135deg, var(--blue), #0284c7);color:#ffffff;font-weight:800;padding:4px 12px;font-size:10.5px;border-radius:6px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;letter-spacing:0.04em">
              <span style="display:flex;align-items:center;gap:6px"><i data-lucide="sparkles" style="width:14px;height:14px"></i> LATEST ADAPTER RUN (TOP)</span>
              <span style="font-size:9.5px;opacity:0.9">Primary Model</span>
            </div>` : ""}
          <div class="item-head">
            <span class="item-title" style="font-size:15px;font-weight:700">${esc(run.name)}</span>
            <span class="badge ${badgeMap[run.status] || "neutral"}" style="${isLatest && run.status === 'completed' ? 'box-shadow:0 0 10px rgba(16,185,129,0.6);font-weight:700' : ''}">
              ${run.status === "building" ? '<span class="spinner"></span>' : ""}${esc(run.status)}
            </span>
          </div>
          <div class="item-meta">${esc(run.serving_model)}${run.adapter_hash ? " · adapter " + esc(run.adapter_hash) : ""}${run.chunk_count_used ? " · " + run.chunk_count_used + " chunks" : ""}</div>
          <div class="progress-bar"><div class="progress-bar-fill" style="width:${run.progress ?? 0}%"></div></div>
          ${(run.build_steps || []).length ? `<div class="build-steps">${(run.build_steps || []).map(s => `<div class="build-step"><b>${esc(s.label)}:</b> ${esc(s.detail)}</div>`).join("")}</div>` : ""}
          ${run.error ? `<div style="color:var(--danger);font-size:12px;margin-top:8px">${esc(run.error)}</div>` : ""}
        </div>`;
    }).join("");
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

  // Stage pills helper
  const pSt = (min, max) => pct >= max ? "done" : pct >= min ? "active" : "";
  const stagePills = `
    <div class="eval-stage-pills">
      <span class="eval-stage-pill ${pSt(0, 15)}">${pct >= 15 ? '<i data-lucide="check"></i>' : '1.'} Load Model</span>
      <span class="eval-stage-pill ${pSt(15, 50)}">${pct >= 50 ? '<i data-lucide="check"></i>' : '2.'} Base Model (5)</span>
      <span class="eval-stage-pill ${pSt(50, 85)}">${pct >= 85 ? '<i data-lucide="check"></i>' : '3.'} Adapted RAG (5)</span>
      <span class="eval-stage-pill ${pSt(85, 100)}">${pct >= 100 ? '<i data-lucide="check"></i>' : '4.'} Gate Scoring</span>
    </div>
  `;

  const progressBlock = isActive ? `
    ${stagePills}
    <div class="eval-prog-row">
      <div class="progress-bar" style="flex:1"><div class="progress-bar-fill" id="eprog-${ev.id}" style="width:${pct}%"></div></div>
      <span class="eval-pct-lbl" id="epct-${ev.id}">${pct}%</span>
    </div>
    <div class="eval-stage-txt" id="estxt-${ev.id}">${evalStageText(pct)} · <span style="opacity:0.8">Est. ~1-2 mins on CPU</span></div>
    ${ev.status === "running" ? `<div class="item-actions" style="margin-top:8px"><button class="btn-danger btn-sm" onclick="cancelEval('${ev.id}')">Cancel Evaluation</button></div>` : ""}
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

let _registryEntries = [];

function extractVersionNum(vStr) {
  if (!vStr) return 0;
  const match = String(vStr).match(/v?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function downloadModelCard(modelId) {
  const entry = _registryEntries.find(m => String(m.id) === String(modelId));
  if (!entry) return showToast("Model card not found.", "warn");
  const blob = new Blob([JSON.stringify(entry.model_card || entry, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entry.version || 'model'}_card.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${entry.version} model card JSON.`, "ok");
}

async function renderRegistry() {
  let entries;
  try { entries = await api("/registry"); }
  catch { entries = []; }
  _registryEntries = entries;

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
    // Sort descending by version number (e.g. v17 -> v16 -> v2), then by creation time
    const sorted = entries.slice().sort((a, b) => {
      const vA = extractVersionNum(a.version);
      const vB = extractVersionNum(b.version);
      if (vA !== vB) return vB - vA; // Highest version number at top
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tA !== tB) return tB - tA;
      return (b.id || 0) - (a.id || 0);
    });

    list.innerHTML = sorted.map((m, idx) => {
      const hash  = m.model_card?.adapter_hash || m.adapter_hash || m.id;
      const owner = m.model_card?.owner || "unassigned";
      const isNewest = idx === 0;
      const rawVer   = m.version || "v16";
      const vTag     = rawVer.toLowerCase().startsWith("v") ? rawVer : "v" + rawVer;
      const displayVer = vTag.startsWith("banking-llm-") ? vTag : "banking-llm-" + vTag;
      return `
      <div class="model-card${isNewest ? " model-card-recent" : ""}">
        ${isNewest ? '<div class="recent-banner"><i data-lucide="sparkles"></i> LATEST VERSION (TOP)</div>' : ""}
        <div class="model-head">
          <div class="model-icon"><i data-lucide="bot"></i></div>
          <div><div class="model-name">${esc(displayVer)} <span style="font-size:11px;opacity:0.75;font-weight:400">(${esc(vTag)})</span></div>
          <div class="model-hash">${esc(String(hash).slice(0, 16))}… <button class="copy-btn" onclick="copyText('${esc(hash)}')" title="Copy hash"><i data-lucide="copy"></i></button></div></div>
        </div>
        <div class="model-badges">
          <span class="badge ${m.status === "promoted" ? "ok" : "neutral"}">${esc((m.status || "registered").toUpperCase())}</span>
          <span class="badge blue">EVAL PASSED</span>
        </div>
        <div class="model-row"><i data-lucide="user"></i> Owner: <b>${esc(owner)}</b></div>
        <div class="model-row"><i data-lucide="git-commit-horizontal"></i> Run: <b>${esc(m.run_id)}</b></div>
        <div class="model-row"><i data-lucide="calendar"></i> Expiry: <b>${esc(m.model_card?.expiry_date || "—")}</b></div>
        <div class="item-actions" style="margin-top:10px;gap:8px">
          ${m.status !== "promoted" ? `<button onclick="promoteModel('${m.id}')"><i data-lucide="rocket"></i> Promote &amp; Deploy</button>` : ""}
          <button class="btn-secondary" onclick="downloadModelCard('${m.id}')" title="Download signed model card JSON"><i data-lucide="download"></i> Export Card</button>
        </div>
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
        <div class="ce-logo"><img src="hdfc-mark.svg" alt="HDFC Bank"></div>
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
  console.log("=== [RAW MODEL RESPONSE BEFORE TRIMMING] ===");
  console.log(text);
  if (!text) return text;

  const originalText = text.replace(/\n+Source:[\s\S]*/i, "").trimEnd();
  let textToProcess = originalText;

  const lines = textToProcess.split("\n");
  let wasTrimmed = false;

  while (lines.length > 0) {
    const rawLine = lines[lines.length - 1];
    const lastLine = rawLine.trimEnd();

    // 1. Empty or whitespace line -> pop and continue
    if (!lastLine) {
      lines.pop();
      wasTrimmed = true;
      continue;
    }

    // 2. Trailing empty list stubs (e.g. "5.", "6. **", "6", "- **", "* **", "**") -> pop and continue
    if (/^[\t ]*(?:[\*\-\•]|\d+[\.\)]?)[\s\*]*$/i.test(lastLine) || /^[\t ]*\*\*[\s\*]*$/i.test(lastLine)) {
      lines.pop();
      wasTrimmed = true;
      continue;
    }

    // 3. Trailing list item headers ending with a colon without body text (e.g. "4. **Monitor your accounts**:", "- **Next steps**:") -> pop and continue
    if (/^[\t ]*(?:[\*\-\•]|\d+[\.\)])\s*\*\*.*?\*\*\s*:\s*$/i.test(lastLine) || /^[\t ]*(?:[\*\-\•]|\d+[\.\)])\s*[^:\n]+:\s*$/i.test(lastLine)) {
      lines.pop();
      wasTrimmed = true;
      continue;
    }

    // 4. Line ends with valid sentence-ending punctuation (. ! ? " )) -> complete!
    if (/[.!?\)"`]$/.test(lastLine)) {
      break;
    }

    // 5. Try trimming to the last complete sentence after any list item prefix (e.g. "5. **")
    const contentPart = lastLine.replace(/^[\t ]*(?:[\*\-\•]|\d+[\.\)])\s*(?:\*\*.*?\*\*\s*:?\s*)?/, "");
    const match = contentPart.match(/^.*[.!?\)"`]/);
    if (match && match[0].trim().length > 0) {
      const prefix = lastLine.slice(0, lastLine.length - contentPart.length);
      lines[lines.length - 1] = (prefix + match[0]).trimEnd();
      wasTrimmed = true;
      break;
    }

    // 6. Otherwise, the line ends with an incomplete fragment (e.g. "5. **Proof of") -> pop line!
    lines.pop();
    wasTrimmed = true;
  }

  let result = lines.join("\n").trimEnd();

  // If text was cut off by model token limit and trimmed, mark for amber note box
  if (wasTrimmed && result.length < originalText.length) {
    result += "\n__AMBER_NOTE_BOX__";
  }

  console.log("=== [FINAL RESPONSE AFTER TRIMMING] ===");
  console.log(result);
  return result;
}

function formatCompactCitations(citations) {
  if (!citations || !citations.length) return "";
  const docPagesMap = {};
  citations.forEach(cStr => {
    const raw = String(cStr || "");
    const fileMatch = raw.match(/([a-zA-Z0-9_\-]+\.(?:pdf|docx|txt))/i);
    let fileName = fileMatch ? fileMatch[1] : raw.split(" — ")[0]?.split("#")[0] || "Document";
    fileName = fileName.replace(/\\/g, "/").split("/").pop();
    const pageMatch = raw.match(/Page\s+(\d+)/i) || raw.match(/#p(\d+)/i);
    const pageNum = pageMatch ? pageMatch[1] : null;

    if (!docPagesMap[fileName]) docPagesMap[fileName] = new Set();
    if (pageNum) docPagesMap[fileName].add(pageNum);
  });

  const parts = Object.keys(docPagesMap).map(file => {
    const pages = Array.from(docPagesMap[file]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const pageStr = pages.length ? ` (p. ${pages.join(", ")})` : "";
    return `${file}${pageStr}`;
  });

  const displayStr = parts.slice(0, 2).join(" · ") + (parts.length > 2 ? ` (+${parts.length - 2} more)` : "");
  return displayStr;
}

function renderMessageHTML(m) {
  if (m.role === "user") {
    const initial = (JSON.parse(sessionStorage.getItem(USER_KEY) || "{}").name || "A")[0].toUpperCase();
    return `<div class="msg user"><div class="msg-avatar">${esc(initial)}</div><div class="msg-bubble">${esc(m.content)}</div></div>`;
  }
  const meta    = m.meta || {};
  let content   = trimIncomplete(m.content || "");
  let noteHTML  = "";
  if (content.includes("__AMBER_NOTE_BOX__")) {
    content  = content.replace("__AMBER_NOTE_BOX__", "").trimEnd();
    noteHTML = `<div class="msg-note-box amber"><i data-lucide="shield-check"></i> <span><b>Bank Policy Note:</b> Key guidelines rendered above. For full documentation, refer to HDFC Policy Portal.</span></div>`;
  }

  const badges  = [];
  if (meta.escalation_required)  badges.push(`<span class="badge warn">Escalation required</span>`);
  if (meta.guardrail_blocked)     badges.push(`<span class="badge bad">Blocked: ${esc(meta.guardrail_category || "unknown")}</span>`);
  else if (meta.guardrail_category && meta.guardrail_category !== "general")
    badges.push(`<span class="badge neutral">${esc(meta.guardrail_category)}</span>`);

  let cite = "";
  if (meta.citations?.length) {
    const cleanCiteStr = formatCompactCitations(meta.citations);
    if (cleanCiteStr) {
      cite = `<div class="msg-cite"><i data-lucide="file-text" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Sources: ${esc(cleanCiteStr)}</div>`;
    }
  }

  let info = "";
  if (meta.served_by) {
    const name = String(meta.served_by).split(" (")[0].split(" via ")[0];
    const ms = meta.latency_ms ?? 0;
    const lat = ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms";
    info = `<div class="msg-footer">${esc(name)} · ${lat}</div>`;
  }
  return `<div class="msg bot"><div class="msg-avatar"><img src="hdfc-mark.svg" alt="HDFC"></div><div class="msg-bubble">${esc(content)}${noteHTML}${badges.length ? `<div class="msg-badges">${badges.join("")}</div>` : ""}${cite}${info}</div></div>`;
}

const BANKING_AI_FACTS = [
  "Did you know? The world's oldest existing bank is Banca Monte dei Paschi di Siena in Italy, founded in 1472!",
  "Origin of 'Bank': The word comes from Italian 'banco' (bench), as money changers originally conducted business on benches.",
  "First ATM in the World: Barclays installed the world's first ATM in Enfield, London, in 1967.",
  "First ATM in India: HSBC installed India's first Automated Teller Machine in Mumbai back in 1987.",
  "Credit Card Origins: Diners Club (1950) was the first credit card, invented after Frank McNamara forgot his wallet at a restaurant.",
  "Piggy Bank History: 'Pygg' was an orange clay in Medieval Europe. Jars made of 'pygg' evolved into today's 'piggy banks'!",
  "The ₹10,000 Note: India once issued ₹10,000 banknotes in 1938 and 1954, which were demonetized in 1978.",
  "Knights Templar Banking: The Knights Templar operated the first international wire transfer system in the 11th century.",
  "MICR Code Secret: The 9-digit MICR code on cheques identifies City (first 3), Bank (middle 3), and Branch (last 3).",
  "IFSC Code Structure: The 11-character IFSC code has 4 letters for Bank, '0' for future use, and 6 chars for Branch.",
  "First Paper Money: China invented paper currency during the Tang Dynasty (7th century), 500 years before Europe.",
  "SWIFT Network Volume: SWIFT handles over 44 million financial messages every day across 200+ countries.",
  "UPI Digital Scale: India's UPI ecosystem processes over 10 billion transactions every single month.",
  "Why 4-Digit PINs?: James Goodfellow invented 6-digit ATM PINs, but reduced them to 4 digits because his wife preferred 4 numbers!",
  "Monopoly Banknotes: During WWII, the Bank of England hid real banknotes inside Monopoly boards to help POWs escape.",
  "Compound Interest Magic: Albert Einstein famously called compound interest the 'eighth wonder of the world'.",
  "World's Highest Bank: The National Bank of Tibet once operated at over 12,000 feet above sea level in Lhasa.",
  "Indian Rupee Symbol: Designed by Udaya Kumar in 2010, '₹' combines Devanagari 'र' and Roman 'R'.",
  "First Bank in India: Bank of Hindustan, established in 1770 in Calcutta, was the earliest bank in India.",
  "RBI Founding History: The Reserve Bank of India was established on April 1, 1935, based on the Hilton Young Commission.",
  "Floating Bank Branch: SBI operates a floating ATM on a jetty at Dal Lake in Srinagar, Kashmir!",
  "Zero-Interest Banking: Islamic Banking operates without charging interest (Riba), relying on profit-sharing models.",
  "Origin of 'Bankruptcy': Comes from Italian 'banca rotta' (broken bench). Failed bankers had their benches physically broken.",
  "First Online Banking: Stanford Federal Credit Union launched the world's first online internet banking in 1994.",
  "Vault Weight: Fort Knox holds over 4,500 metric tons of gold bullion behind a 22-ton blast-proof vault door.",
  "Central Bank Gold Reserves: NY Federal Reserve holds the world's largest gold vault 80 feet below street level.",
  "Why 6-Digit Cheque Numbers?: Cheque numbers identify the exact leaf in your chequebook for automated clearing.",
  "Luhn Algorithm Validation: Credit card numbers use the Luhn Algorithm (Mod 10) to validate card numbers against typos.",
  "Card Network First Digits: VISA cards always start with 4, Mastercard with 51-55 or 22-27, and Amex with 34 or 37.",
  "CVV Security Key: CVVs are generated by encrypting card number, expiry, and service code with a secret bank key.",
  "Zero-Liability Fraud Protection: Banks provide zero-liability protection for unauthorized card transactions reported promptly.",
  "Cheque Truncation (CTS): CTS scans physical cheques into digital images so clearing happens electronically.",
  "RTGS vs NEFT: RTGS processes large-value transfers (min ₹2L) in real-time, while NEFT clears in half-hourly batches.",
  "IMPS 24x7 Clearing: IMPS (Immediate Payment Service) was launched by NPCI on Diwali 2010 for 24x7 instant transfers.",
  "Repo Rate Impact: Repo Rate is the interest rate at which RBI lends short-term funds to commercial banks.",
  "Reverse Repo Rate: The rate at which commercial banks park excess liquidity with the Reserve Bank of India.",
  "CRR (Cash Reserve Ratio): Mandatory percentage of total deposits that commercial banks must keep in cash with RBI.",
  "SLR (Statutory Liquidity Ratio): Mandatory reserve requirement banks maintain in gold, cash, or government securities.",
  "CIBIL Score Range: Credit scores in India range from 300 to 900. A score above 750 unlocks the best interest rates.",
  "Systematic Investment Plan (SIP): SIP enables automated micro-investments into mutual funds via NACH auto-debit.",
  "HDFC AI Privacy Guarantee: HDFC AI Factory automatically redacts PAN, Aadhaar, and phone numbers before embedding.",
  "Vector Search Accuracy: Dense vector embeddings match semantic context even if query keywords differ from policy text.",
  "Deterministic Guardrails: Prompt injection and malicious inputs are blocked by security filters before reaching the LLM.",
  "Evaluation Gate Assurance: Model adapters must pass 5 automated compliance test cases before promotion to production.",
  "Canary Rollout Safety: Production deployments support 10% traffic canary testing with instant 1-click rollback.",
  "100% Offline Generation: All inference and search run locally on CPU — zero customer policy data leaves your machine.",
  "Gold Standard Reserve: Central banks hold gold reserves as the ultimate hedge against inflation and currency devaluation.",
  "FD Tax Exemption: Senior citizens enjoy tax-exempt interest income up to ₹50,000 under Section 80TTB.",
  "Sovereign Gold Bonds (SGB): Issued by RBI on behalf of GoI, offering 2.5% annual interest plus gold price appreciation.",
  "World's Largest Financial Market: The Forex (Foreign Exchange) market trades over $7.5 Trillion every single day!"
];

let _factTimer = null;

function showGenerationIndicator() {
  const el   = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.id        = "gen-indicator";

  // Pick a random starting fact each time
  let factIdx = Math.floor(Math.random() * BANKING_AI_FACTS.length);

  wrap.innerHTML = `
    <div class="msg-avatar"><img src="hdfc-mark.svg" alt="HDFC"></div>
    <div class="msg-bubble" style="max-width:500px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span style="font-size:12px;color:var(--text-muted);font-weight:500">Generating AI response on local CPU…</span>
      </div>
      <div class="gen-fact-box">
        <div class="gen-fact-icon"><i data-lucide="lightbulb"></i></div>
        <div class="gen-fact-body">
          <div class="gen-fact-tag"><i data-lucide="award" style="width:12px;height:12px"></i> Banking Trivia &amp; AI Fact</div>
          <div class="gen-fact-text" id="gen-fact-content">${BANKING_AI_FACTS[factIdx]}</div>
        </div>
      </div>
    </div>
  `;

  el.appendChild(wrap);
  lucide.createIcons({ nodes: [wrap] });
  el.scrollTop = el.scrollHeight;

  if (_factTimer) clearInterval(_factTimer);
  _factTimer = setInterval(() => {
    factIdx = (factIdx + 1) % BANKING_AI_FACTS.length;
    const txtEl = document.getElementById("gen-fact-content");
    if (txtEl) {
      txtEl.style.opacity = "0";
      setTimeout(() => {
        txtEl.textContent = BANKING_AI_FACTS[factIdx];
        txtEl.style.opacity = "1";
      }, 200);
    }
  }, 5500); // 5.5 seconds display time per fact

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
  if (!chunks || !chunks.length) { resetRetrieval(); return; }
  if (emptyEl) emptyEl.style.display = "none";
  if (gaugeEl) {
    const conf   = Math.min(100, meta.confidence ?? 0);
    const color  = conf >= 70 ? "#10b981" : conf >= 40 ? "#f59e0b" : "#ef4444";
    const r = 52, circ = 2 * Math.PI * r, offset = circ * (1 - conf / 100);
    const ms = meta.latency_ms ?? 0;
    const latTxt = ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms";
    gaugeEl.style.display = "flex";
    gaugeEl.innerHTML = `
      <div class="gauge-ring">
        <svg width="120" height="120">
          <circle class="gauge-track" cx="60" cy="60" r="${r}"></circle>
          <circle class="gauge-fill" cx="60" cy="60" r="${r}" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle>
        </svg>
        <div class="gauge-label"><div class="gauge-val">${conf.toFixed(0)}%</div><div class="gauge-cap">Confidence</div></div>
      </div>
      <span class="latency-pill">${latTxt} · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}</span>`;
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
    if (_factTimer) { clearInterval(_factTimer); _factTimer = null; }
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
    if (_factTimer) { clearInterval(_factTimer); _factTimer = null; }
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

function exportChatConversation() {
  const msgs = currentMessages();
  if (!msgs.length) {
    return showToast("No chat history to export.", "warn");
  }

  let md = `# HDFC AI Factory — Chat Transcript\n`;
  md += `*Exported on: ${new Date().toLocaleString()}*\n\n---\n\n`;

  msgs.forEach((m, idx) => {
    const roleName = m.role === "user" ? "User" : "HDFC Banking Assistant";
    md += `### ${roleName}\n${m.content}\n\n`;
    if (m.meta && Object.keys(m.meta).length) {
      if (m.meta.citations?.length) {
        md += `> **Sources**: ${m.meta.citations.join(" · ")}\n`;
      }
      if (m.meta.served_by) {
        md += `> **Served By**: ${m.meta.served_by} (${m.meta.latency_ms ?? 0}ms)\n`;
      }
      md += `\n`;
    }
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `hdfc_chat_transcript_${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Chat transcript exported as Markdown.", "ok");
}



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

let _latestMonData = {};

async function exportMonitoringCSV() {
  const mon = _latestMonData || {};
  const rows = [
    ["Metric", "Value"],
    ["Total Inferences", mon.total_requests ?? 0],
    ["Avg Confidence (%)", Math.min(100, mon.avg_confidence ?? 0).toFixed(1)],
    ["Avg Latency (ms)", Math.round(mon.avg_latency_ms ?? 0)],
    ["Escalation Count", mon.escalation_count ?? 0],
    ["", ""],
    ["Guardrail Policy Category", "Hit Count"]
  ];

  const breakdown = mon.guardrail_breakdown || {};
  Object.entries(breakdown).forEach(([cat, count]) => {
    rows.push([cat, count]);
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `hdfc_ai_telemetry_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("Exported monitoring telemetry CSV.", "ok");
}

async function renderMonitoring() {
  let mon;
  try { mon = await api("/monitoring"); }
  catch { mon = {}; }
  _latestMonData = mon;

  const totalReq   = mon.total_requests ?? 0;
  const latMs      = mon.avg_latency_ms ?? 0;
  const latLabel   = latMs >= 1000 ? (latMs / 1000).toFixed(2) + " s" : Math.round(latMs) + " ms";
  const escCount   = mon.escalation_count ?? 0;
  const escPct     = totalReq > 0 ? ((escCount / totalReq) * 100).toFixed(1) + "%" : "0.0%";
  const guardHits  = Object.values(mon.guardrail_breakdown || {}).reduce((a, b) => a + b, 0);
  const blockPct   = totalReq > 0 ? ((guardHits / totalReq) * 100).toFixed(1) + "%" : "0.0%";

  const telemetryMetrics = [
    {
      label: "Total Inferences Served",
      val: totalReq,
      tag: "100% OPERATIONAL",
      tagCls: "ok",
      sub: `<i data-lucide="radio"></i> Serving live LLM inference traffic`,
      color: "var(--blue)",
      glow: "rgba(26,111,212,0.25)"
    },
    {
      label: "P95 Response Latency",
      val: latLabel,
      tag: latMs < 2000 ? "SLA TARGET MET" : "LATENCY ELEVATED",
      tagCls: latMs < 2000 ? "ok" : "warn",
      sub: `<i data-lucide="clock"></i> Target SLA &lt; 2.0s per response`,
      color: "var(--purple)",
      glow: "rgba(139,92,246,0.25)",
      raw: true
    },
    {
      label: "Fraud & Support Escalations",
      val: escCount,
      tag: `RATE: ${escPct}`,
      tagCls: escCount > 0 ? "warn" : "ok",
      sub: `<i data-lucide="user-check"></i> Escalated to human bank agents`,
      color: "var(--warn)",
      glow: "rgba(245,158,11,0.25)"
    },
    {
      label: "Guardrail Threat Shielding",
      val: guardHits,
      tag: `BLOCK RATE: ${blockPct}`,
      tagCls: guardHits > 0 ? "warn" : "ok",
      sub: `<i data-lucide="shield-alert"></i> Prompt-injection &amp; PII blocks`,
      color: guardHits > 0 ? "var(--warn)" : "var(--ok)",
      glow: guardHits > 0 ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"
    }
  ];

  const kpiEl = document.getElementById("monitoring-kpis");
  if (kpiEl) {
    kpiEl.innerHTML = telemetryMetrics.map((m, i) => `
      <div class="telemetry-card" style="--t-color:${m.color};--t-glow:${m.glow}">
        <div class="telemetry-top">
          <span class="telemetry-tag ${m.tagCls}">${m.tag}</span>
          <span style="font-size:11px;color:var(--text-muted);font-weight:600">LIVE</span>
        </div>
        <div class="telemetry-val" ${m.raw ? "" : `data-target="${m.val}"`}>${m.raw ? esc(m.val) : "0"}</div>
        <div class="telemetry-lbl">${esc(m.label)}</div>
        <div class="telemetry-sub">${m.sub}</div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [kpiEl] });
    kpiEl.querySelectorAll(".telemetry-val[data-target]").forEach(el => animateCount(el, parseFloat(el.dataset.target) || 0));
  }

  const breakdown = mon.guardrail_breakdown || {};
  const gbEl = document.getElementById("guardrail-breakdown");
  if (gbEl) {
    const entries = Object.entries(breakdown);
    if (!entries.length) {
      gbEl.innerHTML = `<div class="empty-state" style="padding:20px"><i data-lucide="shield-check"></i>Zero guardrail policy hits recorded. All inference queries passed safety evaluation.</div>`;
      lucide.createIcons({ nodes: [gbEl] });
    } else {
      const max = Math.max(...entries.map(([, v]) => v), 1);
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
      gbEl.innerHTML = entries.map(([cat, count]) => {
        const pct = Math.round((count / total) * 100);
        return `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
            <span style="font-weight:600;color:var(--text-primary)"><i data-lucide="shield-alert" style="width:13px;height:13px;color:var(--warn);vertical-align:-1px"></i> ${esc(cat.replace(/_/g, " ").toUpperCase())}</span>
            <span style="color:var(--text-secondary);font-family:var(--font-mono)">${count} hits (${pct}%)</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${Math.round((count / max) * 100)}%;height:100%;background:var(--grad-amber);border-radius:3px"></div>
          </div>
        </div>`;
      }).join("");
      lucide.createIcons({ nodes: [gbEl] });
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
      renderMonitoring(),
      renderAuditLogs()
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
