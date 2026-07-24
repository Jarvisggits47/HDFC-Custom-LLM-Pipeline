/* ===================================================
   HDFC Bank — Enterprise AI Factory  |  Frontend
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
    setTimeout(() => toast.remove(), 280);
  }, 3500);
}

// ===================================================
// DARK MODE
// ===================================================

const darkToggle = document.getElementById("dark-toggle");
const darkIcon   = document.getElementById("dark-icon");

function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (darkIcon) {
    darkIcon.setAttribute("data-lucide", dark ? "sun" : "moon");
    lucide.createIcons({ nodes: [darkToggle] });
  }
  localStorage.setItem("hdfc-theme", dark ? "dark" : "light");
}

const savedTheme = localStorage.getItem("hdfc-theme");
if (savedTheme === "dark") applyTheme(true);

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

    const statusMap = {
      ready:   { cls: "ok",   label: "Local model ready" },
      loading: { cls: "warn", label: "Model loading…" },
      failed:  { cls: "bad",  label: "Model load failed" }
    };
    const s = statusMap[h.status] || { cls: "", label: "Status unknown" };
    if (dot)  dot.className  = `status-dot ${s.cls}`;
    if (text) text.textContent = h.model ? `${s.label} — ${h.model}` : s.label;

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
      note.style.color = "var(--muted)";
    }

    // Pre-select model in run form
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
  } catch (e) {
    const dot  = document.getElementById("api-dot");
    const text = document.getElementById("api-status-text");
    if (dot)  dot.className   = "status-dot bad";
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

  // --- KPI cards ---
  const totalChunks    = datasets.reduce((s, d) => s + (d.chunk_count || 0), 0);
  const liveDeploys    = deployments.filter(d => d.status !== "rolled_back").length;
  const totalRequests  = monitoring.total_requests ?? 0;
  const avgConf        = Math.min(100, monitoring.avg_confidence ?? 0).toFixed(1);

  const kpis = [
    { label:"Datasets",          value: datasets.length,          icon:"database",     },
    { label:"Total Chunks",      value: totalChunks,               icon:"layers",       },
    { label:"Adapter Runs",      value: runs.length,               icon:"cpu",          },
    { label:"Evaluations",       value: evals.length,              icon:"shield-check", },
    { label:"Registry Models",   value: registry.length,           icon:"library",      },
    { label:"Live Deployments",  value: liveDeploys,               icon:"rocket",       },
    { label:"Total Requests",    value: totalRequests,             icon:"activity",     },
    { label:"Avg Confidence",    value: avgConf + "%",             icon:"bar-chart-2",  }
  ];

  const kpiGrid = document.getElementById("kpi-grid");
  if (kpiGrid) {
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="${k.icon}"></i></div>
        <div class="kpi-value">${esc(k.value)}</div>
        <div class="kpi-label">${esc(k.label)}</div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [kpiGrid] });
  }

  // --- Pipeline stepper ---
  const hasChunks      = datasets.some(d => (d.chunk_count || 0) > 0);
  const hasApproved    = datasets.some(d => d.status === "approved");
  const hasCompletedRun = runs.some(r => r.status === "completed");
  const hasActiveRun   = runs.some(r => r.status === "building" || r.status === "queued");
  const hasPassedEval  = evals.some(e => e.gate_pass === true);
  const latestEval     = evals.length ? evals[evals.length - 1] : null;
  const evalBlocked    = !hasPassedEval && latestEval && latestEval.gate_pass === false;
  const evalActive     = evals.some(e => e.status === "running" || e.status === "queued");
  const hasActiveDep   = deployments.some(d => d.status === "active" || d.status === "canary");
  const hasLiveDep     = deployments.some(d => d.traffic_pct > 0);

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

  const statusIcon = { done:"check", blocked:"x", active:"", pending:"" };
  const statusText = { done:"Done", active:"In progress", pending:"Pending", blocked:"Blocked" };

  const stepperEl = document.getElementById("pipeline-stepper");
  if (stepperEl) {
    stepperEl.innerHTML = steps.map((s, i) => `
      <div class="step ${s.st}">
        <div class="step-wrapper">
          <div class="step-circle">
            ${s.st === "done" ? '<i data-lucide="check" style="width:14px;height:14px"></i>' : s.st === "blocked" ? '<i data-lucide="x" style="width:14px;height:14px"></i>' : `<span>${i + 1}</span>`}
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
    { key:"API Server",        val:"Operational", cls:"green" },
    { key:"LLM Model",         val: llmStatus.label, cls: llmStatus.cls },
    { key:"Embedding Model",   val: runDone ? "Ready" : "No adapter built", cls: runDone ? "green" : "gray" },
    { key:"Vector Retriever",  val: runDone ? "Ready" : "No adapter — build a run first", cls: runDone ? "green" : "gray" }
  ];
  const healthEl = document.getElementById("health-rows");
  if (healthEl) {
    healthEl.innerHTML = healthRows.map(r => `
      <div class="health-row">
        <span class="health-row-key">${esc(r.key)}</span>
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
      const passColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#dc2626";
      evalEl.innerHTML = `
        <div class="eval-donut-row">
          <div class="donut-chart" style="background:conic-gradient(${passColor} 0% ${pct}%, var(--border) ${pct}% 100%)">
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
      { key:"Total Requests",  val: monitoring.total_requests ?? 0 },
      { key:"Avg Latency",     val: latLabel },
      { key:"Avg Confidence",  val: Math.min(100, monitoring.avg_confidence ?? 0).toFixed(1) + "%" },
      { key:"Escalations",     val: monitoring.escalation_count ?? 0 }
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
      ...runs.map(r => ({ icon:"cpu",          title: r.name || r.id,                    status: r.status,  type:"run" })),
      ...evals.map(e => ({ icon:"shield-check", title: `Eval ${e.id}`,                   status: e.status,  type:"eval" })),
      ...deployments.map(d => ({ icon:"rocket", title: d.endpoint_name || d.id,          status: d.status,  type:"deploy" }))
    ].slice(-5).reverse();

    if (!items.length) {
      actEl.innerHTML = `<div class="empty-state"><i data-lucide="inbox"></i>No activity yet</div>`;
      lucide.createIcons({ nodes: [actEl] });
      return;
    }
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

// ===================================================
// DATASETS
// ===================================================

document.getElementById("load-sample").addEventListener("click", () => {
  document.getElementById("records-textarea").value = JSON.stringify(SAMPLE_RECORDS, null, 2);
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

async function renderDatasets() {
  let datasets;
  try { datasets = await api("/datasets"); }
  catch { datasets = []; }

  const tbody = document.getElementById("dataset-list");
  if (!datasets.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i data-lucide="file-text"></i>No datasets registered yet. Register one above.</div></td></tr>`;
    lucide.createIcons({ nodes: [tbody] });
  } else {
    tbody.innerHTML = datasets.map(ds => {
      const canApprove = ds.status !== "approved" && ((ds.chunk_count || 0) > 0 || (ds.record_count || 0) > 0);
      return `<tr>
        <td class="td-name">${esc(ds.name)}<br><span class="td-mono">${esc(ds.source)}</span></td>
        <td>${ds.chunk_count ?? 0}</td>
        <td>${ds.record_count ?? 0}</td>
        <td><span class="badge neutral">${esc(ds.classification)}</span></td>
        <td><span class="badge ${ds.status === 'approved' ? 'ok' : 'blue'}">${esc(ds.status)}</span></td>
        <td><div class="td-actions">
          ${canApprove ? `<button class="approve-btn" onclick="approveDataset('${ds.id}')">Approve</button>` : ""}
        </div></td>
      </tr>`;
    }).join("");
  }

  // Populate upload select (all datasets, not yet approved)
  const uploadSel = document.getElementById("upload-dataset-select");
  const unapproved = datasets.filter(d => d.status !== "approved");
  uploadSel.innerHTML = unapproved.length
    ? unapproved.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")
    : `<option value="">Register a dataset first</option>`;

  // Populate run dataset select (approved only)
  const runSel = document.getElementById("run-dataset-select");
  const approved = datasets.filter(d => d.status === "approved");
  runSel.innerHTML = approved.length
    ? approved.map(d => `<option value="${d.id}">${esc(d.name)} (${d.record_count ?? 0} records, ${d.chunk_count ?? 0} chunks)</option>`).join("")
    : `<option value="">No approved datasets — approve one first</option>`;
}

// PDF Upload
document.getElementById("upload-pdf-btn").addEventListener("click", async () => {
  const dsId      = document.getElementById("upload-dataset-select").value;
  const fileInput = document.getElementById("pdf-file-input");
  const resultBox = document.getElementById("upload-result");
  if (!dsId)               return showToast("Select a dataset first.", "warn");
  if (!fileInput.files.length) return showToast("Choose a PDF file first.", "warn");
  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  resultBox.textContent = "Uploading and extracting text…";
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-pdf`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    const dupNote = data.duplicate_chunks_skipped ? ` · ${data.duplicate_chunks_skipped} duplicate chunks skipped` : "";
    const piiNote = data.pii_redacted ? " (PII found and redacted)" : "";
    resultBox.textContent = `Indexed ${safe(data.filename, "file")}: ${data.chunks_created ?? 0} chunks created${dupNote}${piiNote}.`;
    fileInput.value = "";
    showToast(`${data.chunks_created ?? 0} chunks indexed.`, "ok");
    refreshAll();
  } catch (err) {
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
  resultBox.textContent = "Chunking and scanning for PII…";
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-text`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    const piiNote = data.pii_redacted ? " (PII found and redacted)" : "";
    resultBox.textContent = `Indexed ${safe(data.filename, filename)}: ${data.chunks_created ?? 0} chunks created${piiNote}.`;
    document.getElementById("paste-text").value = "";
    showToast(`${data.chunks_created ?? 0} chunks indexed.`, "ok");
    refreshAll();
  } catch (err) {
    resultBox.textContent = "Upload failed: " + err.message;
    showToast(err.message, "bad");
  }
});

// ===================================================
// RUNS
// ===================================================

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

  const list = document.getElementById("run-list");
  if (!runs.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="cpu"></i>No runs yet. Register and approve a dataset, then build an adapter.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    const badgeMap = { queued:"neutral", building:"warn", completed:"ok", failed:"bad" };
    list.innerHTML = runs.map(run => `
      <div class="item-card">
        <div class="item-head">
          <span class="item-title">${esc(run.name)}</span>
          <span class="badge ${badgeMap[run.status] || "neutral"}">
            ${run.status === "building" ? '<span class="spinner"></span>' : ""}${esc(run.status)}
          </span>
        </div>
        <div class="item-meta">${esc(run.serving_model)}${run.adapter_hash ? " · adapter " + esc(run.adapter_hash) : ""}${run.chunk_count_used ? " · " + run.chunk_count_used + " chunks indexed" : ""}</div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${run.progress ?? 0}%"></div></div>
        ${(run.build_steps || []).length ? `<div class="build-steps">${(run.build_steps || []).map(s => `<div class="build-step"><b>${esc(s.label)}:</b> ${esc(s.detail)}</div>`).join("")}</div>` : ""}
        ${run.error ? `<div style="color:var(--danger);font-size:12px;margin-top:8px">${esc(run.error)}</div>` : ""}
      </div>
    `).join("");
    lucide.createIcons({ nodes: [list] });
  }

  // Populate eval run select
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

async function renderEvaluations() {
  let evals;
  try { evals = await api("/evaluations"); }
  catch { evals = []; }

  const list = document.getElementById("eval-list");
  if (!evals.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="shield-check"></i>No evaluations run yet. Each one calls the live model twice per test case — takes a few minutes on CPU.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    const badgeMap = { queued:"neutral", running:"warn", completed:"ok", failed:"bad" };
    list.innerHTML = evals.map(ev => {
      const results = ev.results || {};
      const cases   = results.adapted_model_results || [];
      const gateLabel = ev.status !== "completed" ? esc(ev.status)
        : ev.gate_pass ? "Gate: PASS" : "Gate: BLOCKED";
      const gateCls   = ev.status !== "completed" ? badgeMap[ev.status] || "neutral"
        : ev.gate_pass ? "ok" : "bad";
      return `
        <div class="item-card">
          <div class="item-head">
            <span class="item-title">Evaluation <span class="td-mono">${esc(ev.id)}</span></span>
            <span class="badge ${gateCls}">
              ${ev.status === "running" ? '<span class="spinner"></span>' : ""}${gateLabel}
            </span>
          </div>
          <div class="item-meta">run: ${esc(ev.run_id)}${results.adapted_pass_rate ? " · adapted: " + esc(results.adapted_pass_rate) + " · base: " + esc(results.base_pass_rate) : ""}</div>
          ${ev.status === "running" || ev.status === "queued" ? `
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${ev.progress ?? 0}%"></div></div>
          ` : ""}
          ${ev.status === "running" ? `
            <div class="item-actions">
              <button class="btn-danger btn-sm" onclick="cancelEval('${ev.id}')">Cancel</button>
            </div>
          ` : ""}
          ${ev.error ? `<div style="color:var(--danger);font-size:12px;margin-top:8px">${esc(ev.error)}</div>` : ""}
          ${cases.length ? `
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
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
    lucide.createIcons({ nodes: [list] });
  }

  // Populate registry eval select — only passed evaluations
  const sel = document.getElementById("registry-eval-select");
  const passed = evals.filter(e => e.status === "completed" && e.gate_pass === true);
  sel.innerHTML = passed.length
    ? passed.map(ev => `<option value="${ev.id}" data-run-id="${ev.run_id}">${esc(ev.id)} — Pass (run: ${esc(ev.run_id)})</option>`).join("")
    : `<option value="">No passed evaluations yet</option>`;

  const anyActive = evals.some(e => e.status === "queued" || e.status === "running");
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

async function renderRegistry() {
  let entries;
  try { entries = await api("/registry"); }
  catch { entries = []; }

  const list = document.getElementById("registry-list");
  if (!entries.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="library"></i>No registered models yet. Pass an evaluation gate first.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    list.innerHTML = entries.map(m => `
      <div class="item-card">
        <div class="item-head">
          <span class="item-title">${esc(m.version)}</span>
          <span class="badge ${m.status === "promoted" ? "ok" : "neutral"}">${esc(m.status)}</span>
        </div>
        <div class="item-meta">run: ${esc(m.run_id)} · owner: ${esc(m.model_card?.owner || "unassigned")} · expiry: ${esc(m.model_card?.expiry_date || "—")}</div>
        ${m.status !== "promoted" ? `<div class="item-actions"><button onclick="promoteModel('${m.id}')">Promote &amp; deploy canary</button></div>` : ""}
      </div>
    `).join("");
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

// Deploy form (promote button)
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

async function renderDeployments() {
  let deps;
  try { deps = await api("/deployments"); }
  catch { deps = []; }

  const list = document.getElementById("deployment-list");
  if (!deps.length) {
    list.innerHTML = `<div class="item-card"><div class="empty-state"><i data-lucide="rocket"></i>No deployments yet. Register a model, then promote it.</div></div>`;
    lucide.createIcons({ nodes: [list] });
  } else {
    const badgeMap = { canary:"warn", active:"ok", rolled_back:"bad" };
    list.innerHTML = deps.map(d => `
      <div class="item-card">
        <div class="item-head">
          <span class="item-title">${esc(d.endpoint_name || d.id)}</span>
          <span class="badge ${badgeMap[d.status] || "neutral"}">${esc(d.status)}</span>
        </div>
        <div class="item-meta">model: ${esc(d.model_id)} · traffic: ${d.traffic_pct ?? 0}%</div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${d.traffic_pct ?? 0}%"></div></div>
        ${d.status !== "rolled_back" ? `
          <div class="item-actions">
            <button onclick="expandDeploy('${d.id}')"><i data-lucide="trending-up"></i> Expand +10%</button>
            <button onclick="rollbackDeploy('${d.id}')" style="color:var(--danger);border-color:var(--danger)"><i data-lucide="undo-2"></i> Rollback</button>
          </div>
        ` : ""}
      </div>
    `).join("");
    lucide.createIcons({ nodes: [list] });
  }

  // Populate playground deployment select
  const sel = document.getElementById("infer-deployment-select");
  const active = deps.filter(d => d.status !== "rolled_back");
  sel.innerHTML =
    `<option value="">Base model — no deployment, no banking context</option>` +
    active.map(d => `<option value="${d.id}">${esc(d.endpoint_name || d.id)} (${esc(d.status)})</option>`).join("");
}

// ===================================================
// PLAYGROUND
// ===================================================

document.getElementById("infer-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form   = new FormData(e.target);
  const box    = document.getElementById("infer-result");
  const srcBox = document.getElementById("infer-sources");
  const srcList = document.getElementById("sources-list");

  box.style.display = "block";
  srcBox.style.display = "none";
  box.innerHTML = `<div class="item-title"><span class="spinner"></span> Calling live model…</div>`;

  try {
    const result = await api("/inference", {
      method: "POST",
      body: JSON.stringify({
        deployment_id: form.get("deployment_id") || null,
        prompt:        form.get("prompt")
      })
    });

    const conf      = Math.min(100, result.confidence ?? 0);
    const confColor = conf >= 70 ? "var(--success)" : conf >= 40 ? "var(--warning)" : "var(--danger)";
    const escalBadge  = result.escalation_required ? `<span class="badge warn">Escalation required</span>` : "";
    const guardrailBadge = result.guardrail_blocked
      ? `<span class="badge bad">Blocked: ${esc(result.guardrail_category || "unknown")}</span>`
      : result.guardrail_category && result.guardrail_category !== "general"
        ? `<span class="badge neutral">${esc(result.guardrail_category)}</span>` : "";

    box.innerHTML = `
      <div class="item-head" style="margin-bottom:10px">
        <span class="item-title">Response</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${escalBadge}${guardrailBadge}</div>
      </div>
      <p>${esc(result.answer || "No response received.")}</p>
      <div class="item-meta" style="margin-top:8px">
        Served by: ${esc(result.served_by || "—")} · ${result.latency_ms ?? 0} ms
        ${result.retrieved_chunks?.length ? ` · Confidence: <span style="color:${confColor};font-weight:700">${conf.toFixed(1)}%</span>` : ""}
      </div>
      ${result.citations?.length ? `
        <div class="field-label" style="margin-top:12px">Citations</div>
        ${result.citations.map(c => `<div class="source-chunk">${esc(c)}</div>`).join("")}
      ` : ""}
    `;

    // Retrieved sources panel
    if (result.retrieved_chunks?.length) {
      srcBox.style.display = "block";
      srcList.innerHTML = result.retrieved_chunks.map((chunk, i) => `
        <div class="source-chunk">
          <div style="font-size:10px;font-weight:700;color:var(--blue);margin-bottom:4px">SOURCE ${i + 1}</div>
          ${esc(chunk.slice(0, 300))}${chunk.length > 300 ? "…" : ""}
        </div>
      `).join("");
    }
  } catch (err) {
    box.innerHTML = `<div class="item-title" style="color:var(--danger)"><i data-lucide="alert-circle"></i> Request failed</div><p>${esc(err.message)}</p>`;
    lucide.createIcons({ nodes: [box] });
  }
});

// ===================================================
// MONITORING
// ===================================================

async function renderMonitoring() {
  let mon;
  try { mon = await api("/monitoring"); }
  catch { mon = {}; }

  const latMs    = mon.avg_latency_ms ?? 0;
  const latLabel = latMs >= 1000 ? (latMs / 1000).toFixed(2) + " s" : Math.round(latMs) + " ms";
  const avgConf  = Math.min(100, mon.avg_confidence ?? 0).toFixed(1);

  const kpis = [
    { label:"Total Requests",   value: mon.total_requests ?? 0,              icon:"activity" },
    { label:"Avg Latency",      value: latLabel,                              icon:"clock" },
    { label:"Avg Confidence",   value: avgConf + "%",                         icon:"bar-chart-2" },
    { label:"Escalations",      value: `${mon.escalation_count ?? 0} (${((mon.escalation_rate ?? 0) * 100).toFixed(1)}%)`, icon:"alert-triangle" }
  ];

  const kpiEl = document.getElementById("monitoring-kpis");
  if (kpiEl) {
    kpiEl.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="${k.icon}"></i></div>
        <div class="kpi-value">${esc(k.value)}</div>
        <div class="kpi-label">${esc(k.label)}</div>
      </div>
    `).join("");
    lucide.createIcons({ nodes: [kpiEl] });
  }

  const breakdown = mon.guardrail_breakdown || {};
  const gbEl = document.getElementById("guardrail-breakdown");
  if (gbEl) {
    const entries = Object.entries(breakdown);
    if (!entries.length) {
      gbEl.innerHTML = `<div class="empty-state">No guardrail events recorded yet.</div>`;
    } else {
      const max = Math.max(...entries.map(([, v]) => v), 1);
      gbEl.innerHTML = entries.map(([cat, count]) => `
        <div class="guardrail-row">
          <span class="guardrail-label">${esc(cat.replace(/_/g, " "))}</span>
          <div class="guardrail-bar-wrap">
            <div class="guardrail-bar" style="width:${Math.round((count / max) * 100)}%"></div>
          </div>
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
  const hh  = now.getHours();
  const mm  = String(now.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12  = ((hh % 12) || 12);
  el.textContent = `Updated ${h12}:${mm} ${ampm}`;
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
// INIT + AUTO-REFRESH
// ===================================================

refreshAll();
setInterval(checkHealth, 10000);
setInterval(refreshAll, 30000);
