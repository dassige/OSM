// public/js/statistics-controller.js
const registry = window.StatRegistry || {};
const statSelect = document.getElementById('statSelect');
const descTitle = document.getElementById('descTitle');
const descBody = document.getElementById('descBody');
const statPanel = document.getElementById('statPanel');

let appConfig = {};

async function initStats() {
    const c = await (await fetch('/ui-config')).json();
    appConfig = c;
    if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
    if (c.loginTitle) document.title = "Statistics - " + c.loginTitle;
    if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
}

// [NEW] Scroll Logic
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.onscroll = function () {
    if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        scrollTopBtn.style.display = "flex";
    } else {
        scrollTopBtn.style.display = "none";
    }
};

function loadStatDescription() {
    const stat = registry[statSelect.value];
    if (stat) {
        descTitle.textContent = stat.title;
        descBody.textContent = stat.description;
    }
}

async function runStat() {
    const key = statSelect.value;
    if (!key) return;

    statPanel.innerHTML = '<div class="spinner" style="margin:50px auto; display:block; border-top-color:#333;"></div>';

    try {
        const res = await fetch(`/api/statistics/data/${key}`);
        const data = await res.json();
        statPanel.innerHTML = registry[key].renderHtml(data, appConfig);
        // Delay chart init until DOM is ready
        setTimeout(() => registry[key].initCharts(data), 50);
    } catch (e) { statPanel.innerHTML = `<p style="color:red;">Error: ${e.message}</p>`; }
}

// [NEW] PDF Export Logic for Charts
async function downloadPdf() {
    const contentPanel = document.getElementById('statPanel');
    if (!contentPanel || contentPanel.innerHTML.includes('Refresh Data')) {
        if(window.showToast) showToast("Please run a statistic view first.", "warning");
        return;
    }

    const btn = document.querySelector('button[onclick="downloadPdf()"]');
    const origText = btn.textContent;
    btn.textContent = "Generating...";
    btn.disabled = true;

    // 1. Capture Charts as Base64 Images
    const charts = contentPanel.querySelectorAll('canvas');
    const chartImages = Array.from(charts).map(canvas => canvas.toDataURL('image/png'));

    // 2. Clone the content and replace <canvas> with <img>
    const clone = contentPanel.cloneNode(true);
    const cloneCanvases = clone.querySelectorAll('canvas');
    cloneCanvases.forEach((canvas, idx) => {
        const img = document.createElement('img');
        img.src = chartImages[idx];
        img.style.width = '100%';
        img.style.maxWidth = '380px'; // Optimized for A4 PDF column width
        img.style.display = 'block';
        img.style.margin = '10px auto';
        canvas.parentNode.replaceChild(img, canvas);
    });

    // 3. Construct Payload (matching reports-controller style)
    const fullHtml = `
        <html>
        <head>
            <style>
                body { font-family: sans-serif; font-size: 12px; color: #000; }
                .rpt-header { border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px; }
                .stats-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
                .chart-card { border: 1px solid #ddd; padding: 15px; border-radius: 6px; width: 45%; text-align: center; }
                .chart-title { font-weight: bold; margin-bottom: 10px; }
            </style>
        </head>
        <body>${clone.innerHTML}</body>
        </html>
    `;

    try {
        const res = await fetch('/api/reports/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: fullHtml, title: statSelect.value })
        });

        if (!res.ok) throw new Error("Server failed to generate PDF");

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Stats-${statSelect.value}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        if(window.showToast) showToast("PDF Downloaded successfully", "success");
    } catch (e) {
        showToast("Error generating PDF: " + e.message, "error");
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}


initStats();