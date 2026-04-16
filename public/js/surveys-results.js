// public/js/surveys-results.js
const urlParams = new URLSearchParams(window.location.search);
const liveSurveyId = urlParams.get("id");

let surveyData = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!liveSurveyId) {
    showToast("No Survey ID provided.", "error");
    return;
  }
  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      if (c.loginTitle) {
        document.title = "Survey Results - " + c.loginTitle;
        document.getElementById("pageHeader").innerText =
          "Survey Results - " + c.loginTitle;
      }
      if (c.appBackground)
        document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === "demo")
        document.getElementById("demoBanner").style.display = "block";
    });

  await loadResults();
});

async function loadResults() {
  try {
    const res = await fetch(`/api/surveys/instances/${liveSurveyId}/results`);
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || "Failed to fetch results");

    surveyData = result;
    document.getElementById("surveyTitle").innerText = result.instanceName;
    document.getElementById("totalSubmissions").innerText =
      surveyData.responseCount + "/" + surveyData.stats.totalInvited;

    renderResults();
  } catch (e) {
    showToast(e.message, "error");
  }
}
function renderResults() {
  const container = document.getElementById("resultsContainer");
  container.innerHTML = "";

  if (surveyData.responseCount === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No responses have been submitted yet.</div>`;
    return;
  }

  // Loop through every question in the survey structure
  surveyData.structure.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "result-card";

    let desc = (question.description || "").trim();

    // Nullify the top margin of the first paragraph so it aligns perfectly with the flex index number
    desc = desc.replace(/^<p>/i, '<p style="margin-top: 0;">');

    // Map internal DB types to user-friendly labels
    let typeLabel = "Unknown";
    switch (question.type) {
      case "radio":
        typeLabel = "Exclusive Choice";
        break;
      case "checkboxes":
        typeLabel = "Multiple Choice";
        break;
      case "boolean":
        typeLabel = "Yes/No";
        break;
      case "text_multi":
        typeLabel = "Free Text";
        break;
      default:
        typeLabel = question.type;
    }

    // Inject the mapped label right below the question description using a flexbox layout
    let html = `
        <div class="result-title" style="margin-bottom: 5px;">
            <div style="display:flex; align-items: flex-start; gap: 8px;">
                <span style="min-width: 20px; margin-top: 1px;">${index + 1}.</span>
                <div style="flex: 1;">${desc}</div>
            </div>
        </div>
        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 15px;">
            Type: ${typeLabel}
        </div>
    `;

    // TEXT / TEXTAREA
    if (question.type === "text_multi") {
      const answers = surveyData.responses
        .map((r) => r.answers[question.id])
        .filter((a) => a && a.trim() !== "");

      if (answers.length === 0) {
        html += `<div style="color: var(--text-muted); font-size: 13px;">No written responses provided.</div>`;
      } else {
        answers.forEach((a) => {
          html += `<div class="text-response">${escapeHTML(a)}</div>`;
        });
      }
    }
    // RADIO / Boolean / CHECKBOX (Multi-option)
    else if (
      question.type === "radio" ||
      question.type === "checkboxes" ||
      question.type === "boolean"
    ) {
      const counts = {};
      let options = question.options || [];
      if (question.type === "boolean") {
        options = ["Yes", "No"];
      }

      // Initialize counters
      options.forEach((opt) => (counts[opt] = 0));

      // Tally up the votes
      surveyData.responses.forEach((r) => {
        const answer = r.answers[question.id];
        if (!answer) return;

        if (Array.isArray(answer)) {
          // Checkboxes send arrays
          answer.forEach((val) => {
            if (counts[val] !== undefined) counts[val]++;
          });
        } else {
          // Radio/Dropdown send strings
          if (counts[answer] !== undefined) counts[answer]++;
        }
      });

      // Generate Bar Charts
      options.forEach((opt) => {
        const count = counts[opt];
        const percent =
          surveyData.responseCount > 0
            ? Math.round((count / surveyData.responseCount) * 100)
            : 0;

        html += `
                    <div class="bar-container">
                        <div class="bar-label">${escapeHTML(opt)} (${count})</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${percent}%;"></div>
                        </div>
                        <div class="bar-percent">${percent}%</div>
                    </div>
                `;
      });
    }

    card.innerHTML = html;
    container.appendChild(card);
  });
}
function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );
}
