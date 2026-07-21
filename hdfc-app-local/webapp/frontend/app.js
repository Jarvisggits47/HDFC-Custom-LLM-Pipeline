const API = "/api";
lucide.createIcons();

const SAMPLE_RECORDS = [
  {
    task_type: "response_drafting",
    instruction: "Customer asks if the bank can guarantee stock returns on a mutual fund.",
    response: "I'm not able to guarantee investment returns, as performance is subject to market risk. I can share the fund's historical performance and risk category, or connect you with a licensed investment advisor.",
    refusal_required: true,
    escalation_required: false,
    context: [],
    citations: []
  },
  {
    task_type: "response_drafting",
    instruction: "Customer says they suspect unauthorized transactions on their account.",
    response: "I understand this is concerning. I'm escalating this immediately to our fraud investigation team and will place a temporary hold on further transactions while we review your account. You will receive a case reference number shortly.",
    refusal_required: false,
    escalation_required: true,
    context: [],
    citations: []
  },
  {
    task_type: "grounded_question_answering",
    instruction: "What is the minimum balance requirement for a regular savings account?",
    response: "The minimum average monthly balance for a regular savings account is INR 10,000 in metro branches, per policy document policy-sav-001 effective 2026-04-01.",
    context: [{ doc_id: "policy-sav-001", effective_date: "2026-04-01", text: "Regular savings accounts require a minimum average monthly balance of INR 10,000 in metro branches." }],
    citations: ["policy-sav-001"],
    refusal_required: false,
    escalation_required: false
  },
  {
    task_type: "response_drafting",
    instruction: "Customer asks for legal advice on a property dispute related to a home loan.",
    response: "I'm not able to provide legal advice on property disputes. I can share your loan account documents and connect you with the bank's legal or nodal officer for further assistance.",
    refusal_required: true,
    escalation_required: false,
    context: [],
    citations: []
  },
  {
    task_type: "grounded_question_answering",
    instruction: "Can a customer close a fixed deposit before maturity?",
    response: "Yes, premature closure is allowed, but a 1% penalty applies on the applicable interest rate, per policy-fd-014 effective 2026-02-15.",
    context: [{ doc_id: "policy-fd-014", effective_date: "2026-02-15", text: "Premature withdrawal of fixed deposits is permitted subject to a penalty of 1% on the applicable interest rate." }],
    citations: ["policy-fd-014"],
    refusal_required: false,
    escalation_required: false
  },
  {
    task_type: "intent_classification",
    instruction: "Classify the intent: 'Can you waive the annual fee on my credit card?'",
    response: "intent: fee_waiver_request",
    context: [],
    citations: [],
    refusal_required: false,
    escalation_required: false
  },
  {
    task_type: "terminology_normalization",
    instruction: "Rewrite in standard banking terminology: 'client didn't get money back from failed UPI'",
    response: "Customer reported a failed UPI transaction where the debited amount has not yet been reversed to the source account.",
    context: [],
    citations: [],
    refusal_required: false,
    escalation_required: false
  }
];

document.getElementById("load-sample").addEventListener("click", () => {
  document.getElementById("records-textarea").value = JSON.stringify(SAMPLE_RECORDS, null, 2);
});

// ---- tab switching ----
document.querySelectorAll("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    refreshAll();
  });
});

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || res.statusText);
  }
  return res.json();
}

function esc(s) {
  const d = document.createElement("div");
  d.innerText = s ?? "";
  return d.innerHTML;
}

// ---- health / local model status ----
async function checkHealth() {
  try {
    const h = await api("/health");
    const dot = document.getElementById("api-dot");
    const text = document.getElementById("api-status-text");
    const banner = document.getElementById("key-banner");
    if (!h.load_error) {
      dot.className = "status-dot ok";
      text.textContent = `Local model ready — ${h.model}`;
      banner.style.display = "none";
    } else {
      dot.className = "status-dot bad";
      text.textContent = "Local model not loaded yet";
      banner.querySelector("span").textContent = h.load_error;
      banner.style.display = "flex";
    }
  } catch (e) { /* ignore */ }
}

// ---- datasets ----
document.getElementById("dataset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  let records;
  try {
    records = JSON.parse(form.get("records"));
  } catch (err) {
    return alert("Records must be valid JSON — click 'Load sample banking dataset' to see the expected shape.");
  }
  await api("/datasets", {
    method: "POST",
    body: JSON.stringify({
      name: form.get("name"),
      source: form.get("source"),
      purpose: form.get("purpose"),
      classification: form.get("classification"),
      records,
    }),
  });
  e.target.reset();
  await refreshAll();
});

async function renderDatasets() {
  const datasets = await api("/datasets");
  const list = document.getElementById("dataset-list");
  list.innerHTML = datasets.length ? "" : "<p class='hint'>No datasets registered yet.</p>";
  datasets.forEach((ds) => {
    const badge = ds.status === "approved" ? "ok" : "neutral";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${esc(ds.name)} <span class="badge ${badge}">${ds.status}</span></div>
      <div class="item-meta">${esc(ds.source)} · ${esc(ds.purpose)} · ${ds.classification} · ${ds.record_count} records · ${ds.chunk_count} document chunks</div>
      ${ds.status !== "approved" ? `<div class="actions"><button data-approve="${ds.id}">Approve</button></div>` : ""}
    `;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await api(`/datasets/${b.dataset.approve}/approve`, { method: "POST" }); }
      catch (err) { alert(err.message); }
      refreshAll();
    })
  );

  const sel = document.getElementById("run-dataset-select");
  const approved = datasets.filter((d) => d.status === "approved");
  sel.innerHTML = approved.length
    ? approved.map((d) => `<option value="${d.id}">${esc(d.name)} (${d.record_count} records, ${d.chunk_count} chunks)</option>`).join("")
    : `<option value="">No approved datasets — approve one first</option>`;

  const uploadSel = document.getElementById("upload-dataset-select");
  const unapproved = datasets.filter((d) => d.status !== "approved");
  uploadSel.innerHTML = unapproved.length
    ? unapproved.map((d) => `<option value="${d.id}">${esc(d.name)} (not yet approved)</option>`).join("")
    : `<option value="">Register a dataset first</option>`;
}

document.getElementById("upload-pdf-btn").addEventListener("click", async () => {
  const dsId = document.getElementById("upload-dataset-select").value;
  const fileInput = document.getElementById("pdf-file-input");
  const resultBox = document.getElementById("upload-result");
  if (!dsId) return alert("Register a dataset first.");
  if (!fileInput.files.length) return alert("Choose a PDF file first.");
  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  resultBox.textContent = "Uploading and extracting text…";
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-pdf`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    resultBox.textContent = `Indexed ${data.filename}: ${data.chunks_created} chunks created${data.pii_redacted ? " (PII found and redacted)" : ""}.`;
    fileInput.value = "";
    refreshAll();
  } catch (err) {
    resultBox.textContent = "Upload failed: " + err.message;
  }
});

document.getElementById("upload-text-btn").addEventListener("click", async () => {
  const dsId = document.getElementById("upload-dataset-select").value;
  const filename = document.getElementById("paste-filename").value || "pasted-document.txt";
  const text = document.getElementById("paste-text").value;
  const resultBox = document.getElementById("upload-result");
  if (!dsId) return alert("Register a dataset first.");
  if (!text.trim()) return alert("Paste some text first.");
  const fd = new FormData();
  fd.append("filename", filename);
  fd.append("text", text);
  resultBox.textContent = "Chunking and scanning for PII…";
  try {
    const res = await fetch(`${API}/datasets/${dsId}/upload-text`, { method: "POST", body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || res.statusText); }
    const data = await res.json();
    resultBox.textContent = `Indexed ${data.filename}: ${data.chunks_created} chunks created${data.pii_redacted ? " (PII found and redacted)" : ""}.`;
    document.getElementById("paste-text").value = "";
    refreshAll();
  } catch (err) {
    resultBox.textContent = "Upload failed: " + err.message;
  }
});

// ---- runs ----
document.getElementById("run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const datasetId = form.get("dataset_id");
  if (!datasetId) return alert("Approve a dataset first.");
  try {
    await api("/runs", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        serving_model: form.get("serving_model"),
        dataset_id: datasetId,
      }),
    });
  } catch (err) { return alert(err.message); }
  e.target.reset();
  await refreshAll();
});

let runPollHandle = null;

async function renderRuns() {
  const runs = await api("/runs");
  const list = document.getElementById("run-list");
  list.innerHTML = runs.length ? "" : "<p class='hint'>No runs yet.</p>";
  runs.forEach((run) => {
    const badge = { queued: "neutral", building: "warn", completed: "ok", failed: "bad" }[run.status];
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${esc(run.name)} <span class="badge ${badge}">${run.status === "building" ? `<span class="spinner"></span>` : ""}${run.status}</span></div>
      <div class="item-meta">${run.serving_model}${run.adapter_hash ? " · adapter " + run.adapter_hash : ""}${run.record_count_used ? " · " + run.record_count_used + " records" : ""}${run.chunk_count_used ? " · " + run.chunk_count_used + " doc chunks indexed" : ""}</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${run.progress}%"></div></div>
      <div class="build-steps">${(run.build_steps || []).map(s => `<div class="build-step"><b>${s.label}:</b> ${esc(s.detail)}</div>`).join("")}</div>
      ${run.error ? `<div class="item-detail" style="color:var(--danger)">${esc(run.error)}</div>` : ""}
    `;
    list.appendChild(div);
  });

  const sel = document.getElementById("eval-run-select");
  const usable = runs.filter((r) => r.status !== "failed");
  sel.innerHTML = usable.length
    ? usable.map((r) => `<option value="${r.id}">${esc(r.name)} (${r.status})</option>`).join("")
    : `<option value="">No runs yet</option>`;

  const anyActive = runs.some((r) => r.status === "queued" || r.status === "building");
  if (anyActive && !runPollHandle) {
    runPollHandle = setInterval(renderRuns, 1200);
  } else if (!anyActive && runPollHandle) {
    clearInterval(runPollHandle);
    runPollHandle = null;
  }
}

// ---- evaluations ----
document.getElementById("eval-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const runId = form.get("run_id");
  if (!runId) return alert("Build an adapter run first.");
  try {
    await api("/evaluations", { method: "POST", body: JSON.stringify({ run_id: runId }) });
  } catch (err) { return alert(err.message); }
  await refreshAll();
});

let evalPollHandle = null;

async function renderEvaluations() {
  const evals = await api("/evaluations");
  const list = document.getElementById("eval-list");
  list.innerHTML = evals.length ? "" : "<p class='hint'>No evaluations run yet. Each one makes 10 real model calls (5 cases × base/adapted) — takes a bit.</p>";
  evals.forEach((ev) => {
    const gateBadge = ev.status !== "completed" ? "neutral" : (ev.gate_pass ? "ok" : "bad");
    const gateLabel = ev.status === "running" ? `<span class="spinner"></span>running (${ev.progress}%)`
      : ev.status === "queued" ? "queued"
      : ev.status === "failed" ? "failed"
      : (ev.gate_pass ? "gate: pass" : "gate: blocked");
    const cases = ev.results.adapted_model_results || [];
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">Evaluation ${ev.id} <span class="badge ${gateBadge}">${gateLabel}</span></div>
      <div class="item-meta">run ${ev.run_id}${ev.results.adapted_pass_rate ? " · adapted: " + ev.results.adapted_pass_rate + " · base: " + ev.results.base_pass_rate : ""}</div>
      ${ev.status === "running" ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${ev.progress}%"></div></div>` : ""}
      ${ev.error ? `<div class="item-detail" style="color:var(--danger)">${esc(ev.error)}</div>` : ""}
      ${cases.map(c => `
        <div class="case-row">
          <div>
            <div class="case-prompt">${c.id} (${c.severity}, ${c.category}) — ${c.passed ? "PASS" : "FAIL"}${c.retrieval_hit === true ? ' <span class="badge ok" style="margin-left:6px">fact retrieved</span>' : c.retrieval_hit === false ? ' <span class="badge bad" style="margin-left:6px">fact not retrieved</span>' : ""}</div>
            <div class="case-response">"${esc(c.response).slice(0, 140)}${c.response.length > 140 ? "…" : ""}"</div>
          </div>
        </div>`).join("")}
    `;
    list.appendChild(div);
  });

  const sel = document.getElementById("registry-eval-select");
  const completed = evals.filter((e) => e.status === "completed");
  sel.innerHTML = completed.length
    ? completed.map((ev) => `<option value="${ev.id}">${ev.id} — ${ev.gate_pass ? "pass" : "blocked"}</option>`).join("")
    : `<option value="">No completed evaluations yet</option>`;

  const anyActive = evals.some((e) => e.status === "queued" || e.status === "running");
  if (anyActive && !evalPollHandle) {
    evalPollHandle = setInterval(renderEvaluations, 1000);
  } else if (!anyActive && evalPollHandle) {
    clearInterval(evalPollHandle);
    evalPollHandle = null;
  }
}

// ---- registry ----
document.getElementById("registry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const evalId = form.get("evaluation_id");
  if (!evalId) return alert("Run an evaluation first.");
  const ev = (await api("/evaluations")).find((x) => x.id === evalId);
  try {
    await api("/registry", {
      method: "POST",
      body: JSON.stringify({ run_id: ev.run_id, evaluation_id: evalId, owner: form.get("owner") || "unassigned" }),
    });
  } catch (err) { alert(err.message); }
  e.target.reset();
  await refreshAll();
});

async function renderRegistry() {
  const entries = await api("/registry");
  const list = document.getElementById("registry-list");
  list.innerHTML = entries.length ? "" : "<p class='hint'>No registered models yet.</p>";
  entries.forEach((m) => {
    const badge = m.status === "promoted" ? "ok" : "neutral";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${m.version} <span class="badge ${badge}">${m.status}</span></div>
      <div class="item-meta">run ${m.run_id} · owner: ${esc(m.model_card.owner || "unassigned")} · expiry: ${m.model_card.expiry_date || "—"}</div>
      ${m.status !== "promoted" ? `<div class="actions"><button data-promote="${m.id}">Promote &amp; deploy canary</button></div>` : ""}
    `;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-promote]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await api(`/registry/${b.dataset.promote}/promote`, { method: "POST" }); }
      catch (err) { alert(err.message); }
      refreshAll();
    })
  );
}

// ---- deployments ----
async function renderDeployments() {
  const deps = await api("/deployments");
  const list = document.getElementById("deployment-list");
  list.innerHTML = deps.length ? "" : "<p class='hint'>No deployments yet — promote a registered model.</p>";
  deps.forEach((d) => {
    const badge = { canary: "warn", active: "ok", rolled_back: "bad" }[d.status];
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${esc(d.endpoint_name)} <span class="badge ${badge}">${d.status}</span></div>
      <div class="item-meta">model ${d.model_id} · traffic: ${d.traffic_pct}%</div>
      <div class="actions">
        ${d.status !== "rolled_back" ? `<button data-expand="${d.id}">Expand traffic</button>` : ""}
        ${d.status !== "rolled_back" ? `<button data-rollback="${d.id}">Rollback</button>` : ""}
      </div>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-expand]").forEach((b) =>
    b.addEventListener("click", async () => { await api(`/deployments/${b.dataset.expand}/expand`, { method: "POST" }); refreshAll(); })
  );
  list.querySelectorAll("[data-rollback]").forEach((b) =>
    b.addEventListener("click", async () => { await api(`/deployments/${b.dataset.rollback}/rollback`, { method: "POST" }); refreshAll(); })
  );

  const sel = document.getElementById("infer-deployment-select");
  const active = deps.filter((d) => d.status !== "rolled_back");
  sel.innerHTML =
    `<option value="">Base model — no deployment, no banking context</option>` +
    active.map((d) => `<option value="${d.id}">${esc(d.endpoint_name)} (${d.status})</option>`).join("");
}

// ---- playground ----
document.getElementById("infer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const box = document.getElementById("infer-result");
  box.style.display = "block";
  box.innerHTML = `<span class="spinner"></span> Calling live model…`;
  try {
    const result = await api("/inference", {
      method: "POST",
      body: JSON.stringify({ deployment_id: form.get("deployment_id") || null, prompt: form.get("prompt") }),
    });
    const confColor = result.confidence >= 70 ? "var(--success, #16a34a)" : result.confidence >= 40 ? "var(--warn, #d97706)" : "var(--danger, #dc2626)";
    box.innerHTML = `
      <div class="item-title">
        Response
        ${result.escalation_required ? `<span class="badge warn">escalation required</span>` : ""}
        ${result.guardrail_blocked ? `<span class="badge warn">blocked: ${esc(result.guardrail_category)}</span>` : result.guardrail_category !== "general" ? `<span class="badge neutral">${esc(result.guardrail_category)}</span>` : ""}
      </div>
      <p>${esc(result.answer)}</p>
      <div class="item-meta">
        served by: ${esc(result.served_by)} · ${result.latency_ms}ms
        ${result.retrieved_chunks && result.retrieved_chunks.length ? ` · confidence: <span style="color:${confColor};font-weight:600">${result.confidence}%</span>` : ""}
      </div>
      ${result.citations && result.citations.length ? `
        <div class="field-label" style="margin-top:10px">Citations (document · page · chunk id · similarity)</div>
        ${result.citations.map(c => `<div class="case-row"><div class="case-response">${esc(c)}</div></div>`).join("")}
      ` : ""}
      ${result.retrieved_chunks && result.retrieved_chunks.length ? `
        <div class="field-label" style="margin-top:10px">Retrieved for this query (live, not static)</div>
        ${result.retrieved_chunks.map(c => `<div class="case-row"><div class="case-response">"${esc(c).slice(0, 220)}${c.length > 220 ? "…" : ""}"</div></div>`).join("")}
      ` : ""}
    `;
  } catch (err) {
    box.innerHTML = `<div class="item-title" style="color:var(--danger)">Request failed</div><p>${esc(err.message)}</p>`;
  }
});

// ---- overview stats ----
async function renderOverview() {
  const [datasets, runs, evals, registry, deployments, monitoring] = await Promise.all([
    api("/datasets"), api("/runs"), api("/evaluations"), api("/registry"), api("/deployments"), api("/monitoring"),
  ]);
  const totalChunks = datasets.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
  const stats = [
    { label: "Approved datasets", value: datasets.filter(d => d.status === "approved").length },
    { label: "Document chunks indexed", value: totalChunks },
    { label: "Adapter runs", value: runs.length },
    { label: "Evaluations passed", value: evals.filter(e => e.gate_pass).length },
    { label: "Registered models", value: registry.length },
    { label: "Live deployments", value: deployments.filter(d => d.status !== "rolled_back").length },
    { label: "Playground requests", value: monitoring.total_requests },
    { label: "Avg latency (ms)", value: monitoring.avg_latency_ms },
    { label: "Escalations flagged", value: monitoring.escalation_count },
  ];
  document.getElementById("stat-grid").innerHTML = stats.map(s => `
    <div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>
  `).join("");
}

// ---- refresh ----
async function refreshAll() {
  try {
    await checkHealth();
    await renderOverview();
    await renderDatasets();
    await renderRuns();
    await renderEvaluations();
    await renderRegistry();
    await renderDeployments();
    lucide.createIcons();
  } catch (err) { console.error(err); }
}

refreshAll();
setInterval(checkHealth, 10000);
