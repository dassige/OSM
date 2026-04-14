let rawData = [];
let sortCol = "published_at";
let sortDir = "desc";
let uiConfig = null;

document.addEventListener("DOMContentLoaded", () => {
    fetch("/ui-config").then(r => r.json()).then(c => {
        uiConfig = c;
        if (c.loginTitle) {
            document.title = "Live Surveys - " + c.loginTitle;
            document.getElementById("pageHeader").innerText = "Published Surveys - " + c.loginTitle;
        }
        if (c.appMode === "demo") document.getElementById("demoBanner").style.display = "block";
    });

    // Check auth and load sorting preference
    fetch("/api/user-session").then(r => r.json()).then(user => {
        const role = user.role || "guest";
        if (role !== "admin" && role !== "superadmin") {
            showToast("Access Denied.", "error");
            setTimeout(() => window.location.href = "/", 1500);
        } else {
            // Load preferred sort if available
            fetch("/api/profile/preferences").then(r => r.json()).then(prefs => {
                if(prefs.liveSurveySortMode) {
                    const parts = prefs.liveSurveySortMode.split("_dir_");
                    if(parts.length === 2) { sortCol = parts[0]; sortDir = parts[1]; }
                }
                loadData();
            }).catch(() => loadData());
        }
    }).catch(() => window.location.href = "/login.html");

    const scrollTopBtn = document.getElementById("scrollTopBtn");
    window.onscroll = () => { if (scrollTopBtn) scrollTopBtn.style.display = (window.scrollY > 200) ? "flex" : "none"; };
    window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
});

async function loadData() {
    try {
        const res = await fetch("/api/surveys/instances");
        if (!res.ok) throw new Error("Failed to fetch surveys");
        rawData = await res.json();
        renderTable();
    } catch (e) {
        showToast(e.message, "error");
        document.getElementById("tableBody").innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error loading data.</td></tr>`;
    }
}

function setSort(col) {
    if (sortCol === col) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
        sortCol = col;
        sortDir = "asc";
    }
    
    // Save preference
    fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveSurveySortMode: `${sortCol}_dir_${sortDir}` })
    }).catch(e => console.log("Pref save bypassed"));

    renderTable();
}

function renderTable() {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";

    // Clear sort icons
    document.querySelectorAll("th span").forEach(s => s.innerText = "");
    const icon = sortDir === "asc" ? " ▲" : " ▼";
    const sortSpan = document.getElementById(`sort_${sortCol}`);
    if (sortSpan) sortSpan.innerText = icon;

    // Apply Filters
    const nameFilter = document.getElementById("filterName").value.toLowerCase();
    const dateFilter = document.getElementById("filterDate").value;
    const showArchived = document.getElementById("filterArchived").checked;

    let filtered = rawData.filter(item => {
        if (!showArchived && item.is_archived === 1) return false;
        if (showArchived && item.is_archived === 0) return false; // Optional: Only show archived if checked, or show both
        
        if (nameFilter && !(item.name || "").toLowerCase().includes(nameFilter)) return false;
        if (dateFilter) {
            const itemDate = new Date(item.published_at).toISOString().split('T')[0];
            if (itemDate < dateFilter) return false;
        }
        return true;
    });

    // Apply Sorting
    filtered.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];
        
        if (sortCol === 'name') {
            valA = (valA || "").toLowerCase();
            valB = (valB || "").toLowerCase();
        }
        
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 30px; color:var(--text-muted);">No surveys found matching filters.</td></tr>`;
        return;
    }

    filtered.forEach(item => {
        const sent = item.total_sent || 0;
        const submitted = item.total_submitted || 0;
        const pct = sent > 0 ? Math.round((submitted / sent) * 100) : 0;
        
        // Use your UI config locale if passed down, else default
        const dateStr = new Date(item.published_at).toLocaleDateString();

        const tr = document.createElement("tr");
        if (item.is_archived) tr.style.opacity = "0.7";

        let actionsHtml = `
            <button onclick="window.location.href='surveys-results.html?id=${item.id}'" class="btn-sm btn-primary" title="View Results">Results</button>
            <button onclick="window.location.href='surveys-tracking.html?id=${item.id}'" class="btn-sm" style="background:#6c757d; color:white;" title="View Member Tracking">Tracking</button>
        `;

        if (item.is_archived) {
            actionsHtml += `
                <button onclick="toggleArchive(${item.id}, false)" class="btn-sm" style="background:var(--success); color:white;" title="Unarchive">Unarchive</button>
                <button onclick="deleteInstance(${item.id})" class="btn-sm btn-danger" title="Permanently Delete">Delete</button>
            `;
        } else {
            actionsHtml += `
                <button onclick="toggleArchive(${item.id}, true)" class="btn-sm" style="background:var(--bg-body); border:1px solid var(--border-color); color:var(--text-main);" title="Archive">Archive</button>
            `;
        }

        tr.innerHTML = `
            <td style="white-space:nowrap;">${dateStr}</td>
            <td style="font-weight:bold;">${item.name}</td>
            <td>
                <div class="progress-cell">
                    <span style="font-size:13px; min-width:45px;">${submitted} / ${sent}</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct}%;"></div></div>
                    <span style="font-size:12px; color:var(--text-muted); min-width:35px; text-align:right;">${pct}%</span>
                </div>
            </td>
            <td style="text-align:right; display:flex; gap:5px; justify-content:flex-end;">
                ${actionsHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function toggleArchive(id, archive) {
    if(uiConfig?.appMode === 'demo') return showToast("Archiving disabled in Demo Mode", "warning");
    
    try {
        const res = await fetch(`/api/surveys/instances/${id}/archive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_archived: archive })
        });
        if (!res.ok) throw new Error("Failed to update status");
        
        showToast(`Survey instance ${archive ? 'archived' : 'unarchived'}.`, "success");
        loadData();
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function deleteInstance(id) {
    if(uiConfig?.appMode === 'demo') return showToast("Deletion disabled in Demo Mode", "warning");

    if (!(await confirmAction("Delete Instance", "WARNING: This permanently deletes this survey instance, including all tracking data and anonymous responses. This cannot be undone."))) {
        return;
    }

    try {
        const res = await fetch(`/api/surveys/instances/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Deletion failed");
        
        showToast("Survey instance permanently deleted.", "success");
        loadData();
    } catch (e) {
        showToast(e.message, "error");
    }
}