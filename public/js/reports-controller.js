// public/js/reports-controller.js
const registry = window.ReportRegistry || {};
const reportSelect = document.getElementById("reportSelect");
const descTitle = document.getElementById("descTitle");
const descBody = document.getElementById("descBody");
const reportPanel = document.getElementById("reportPanel");

// [NEW] Container for dynamic inputs (will be injected into descCard)
let paramContainer = null;

let appConfig = {};
let userPrefs = {}; // Cache for user preferences

async function initReports() {
  try {
    const c = await (await fetch("/ui-config")).json();
    appConfig = c;
    if (c.appBackground)
      document.body.style.backgroundImage = `url('${c.appBackground}')`;
    if (c.loginTitle) {
      document.title = "Reports - " + c.loginTitle;
      document.getElementById("pageHeader").innerText =
        "Reports Console - " + c.loginTitle;
    }
    if (c.appMode === "demo")
      document.getElementById("demoBanner").style.display = "block";

    const user = await (await fetch("/api/user-session")).json();
    if (user.role === "guest") window.location.href = "/";

    // [NEW] Load User Preferences once
    const prefsRes = await fetch("/api/user-preferences");
    if (prefsRes.ok) userPrefs = await prefsRes.json();
  } catch (e) {
    console.error("Init Error:", e);
  }
}

function loadReportDescription() {
  const key = reportSelect.value;
  const report = registry[key];

  // 1. Clear dynamic inputs from the sidebar/description card
  if (paramContainer) paramContainer.innerHTML = "";

  // 2. [NEW] Clear the main report content panel
  if (reportPanel) {
    reportPanel.innerHTML = `
            <div style="text-align:center; color:#ccc; padding-top:100px;">
                Select a report and click "Run Report"
            </div>`;
  }

  if (report) {
    descTitle.textContent = report.title;
    descBody.textContent = report.description;

    // Render new parameters if the report has them
    if (report.params && report.params.length > 0) {
      renderParams(report.params);
    }
  } else {
    descTitle.textContent = "Unknown Report";
    descBody.textContent = "Select a report to view details.";
  }
}
// [NEW] Render Parameter Inputs
function renderParams(params) {
  const card = document.getElementById("descCard");

  // Create container if missing
  if (!document.getElementById("rptParamContainer")) {
    paramContainer = document.createElement("div");
    paramContainer.id = "rptParamContainer";
    paramContainer.style.marginTop = "15px";
    paramContainer.style.paddingTop = "10px";
    paramContainer.style.borderTop = "1px dashed rgba(0,0,0,0.1)";
    card.appendChild(paramContainer);
  } else {
    paramContainer = document.getElementById("rptParamContainer");
    paramContainer.innerHTML = ""; // Clear old inputs
  }

  params.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "10px";

    const label = document.createElement("label");
    label.textContent = p.label + ": ";
    label.style.fontSize = "13px";
    label.style.fontWeight = "bold";
    label.style.display = "block";

    const input = document.createElement("input");
    input.type = p.type || "text";
    input.id = `param_${p.key}`; // e.g. param_days
    input.style.width = "100px";
    input.style.padding = "4px";
    input.style.borderRadius = "4px";
    input.style.border = "1px solid #ccc";

    // Load value from Prefs OR Default
    const savedVal = userPrefs[p.prefKey];
    input.value = savedVal !== undefined ? savedVal : p.default;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    paramContainer.appendChild(wrapper);
  });
}

async function runReport() {
  const key = reportSelect.value;
  if (!key) {
    if (window.showToast) showToast("Please select a report first.", "error");
    return;
  }

  reportPanel.innerHTML =
    '<div class="spinner" style="margin:50px auto; display:block; border-top-color:#333;"></div><p style="text-align:center">Loading Data...</p>';

  // [NEW] Gather Parameters
  const reportDef = registry[key];
  const queryParams = new URLSearchParams();

  if (reportDef.params) {
    for (const p of reportDef.params) {
      const input = document.getElementById(`param_${p.key}`);
      if (input) {
        const val = input.value;
        queryParams.append(p.key, val); // Add to URL query

        // Save to Preferences immediately (Fire and Forget)
        if (p.prefKey) {
          userPrefs[p.prefKey] = val; // Update local cache
          fetch("/api/user-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: p.prefKey, value: val }),
          });
        }
      }
    }
  }

  try {
    // [UPDATED] Append Query String
    const res = await fetch(
      `/api/reports/data/${key}?${queryParams.toString()}`,
    );
    if (!res.ok) throw new Error("Failed to load data");

    const data = await res.json();
    const html = reportDef.render(data, appConfig);
    reportPanel.innerHTML = html;
  } catch (e) {
    reportPanel.innerHTML = `<p style="color:red; text-align:center;">Error: ${e.message}</p>`;
  }
}

// ... (keep downloadPdf and init calls) ...
async function downloadPdf() {
  const content = reportPanel.innerHTML;
  if (!content || content.includes("Select a report")) {
    if (window.showToast) showToast("Please run a report first.", "warning");
    return;
  }
  const btn = document.querySelector('button[onclick="downloadPdf()"]');
  const origText = btn.textContent;
  btn.textContent = "Generating...";
  btn.disabled = true;

  const fullHtml = `
        <html>
        <head>
            <style>
                body { font-family: sans-serif; font-size: 12px; color: #000; }
                .rpt-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; page-break-inside: avoid; }
                .rpt-table th, .rpt-table td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
                .rpt-table th { background-color: #eee; font-weight: bold; }
                .rpt-header { border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px; }
                .rpt-group-header { background-color: #343a40; color: white; padding: 5px; font-weight: bold; margin-top: 15px; page-break-after: avoid; }
                .critical { color: #dc3545; font-weight: bold; }
            </style>
        </head>
        <body>${content}</body>
        </html>
    `;

  try {
    const res = await fetch("/api/reports/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: fullHtml, title: reportSelect.value }),
    });
    if (!res.ok) throw new Error("Server failed to generate PDF");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report-${reportSelect.value}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    if (window.showToast) showToast("PDF Downloaded successfully", "success");
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

initReports();
