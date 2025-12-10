const registry = window.ReportRegistry || {};
const reportSelect = document.getElementById('reportSelect');
const descTitle = document.getElementById('descTitle');
const descBody = document.getElementById('descBody');
const reportPanel = document.getElementById('reportPanel');

// Global Config
let appConfig = {};

// Init: Fetch Config
fetch('/ui-config').then(r => r.json()).then(c => {
    appConfig = c;
    if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
});

function loadReportDescription() {
    const key = reportSelect.value;
    const report = registry[key];
    if (report) {
        descTitle.textContent = report.title;
        descBody.textContent = report.description;
    } else {
        descTitle.textContent = "Unknown Report";
    }
}

async function runReport() {
    const key = reportSelect.value;
    if (!key) {
        if(window.showToast) showToast("Please select a report first.", "error");
        return;
    }

    reportPanel.innerHTML = '<div class="spinner" style="margin:50px auto; display:block; border-top-color:#333;"></div><p style="text-align:center">Loading Data...</p>';

    try {
        const res = await fetch(`/api/reports/data/${key}`);
        if (!res.ok) throw new Error("Failed to load data");
        
        const data = await res.json();
        const reportDef = registry[key];
        
        // Pass Data AND Config (Title) to Renderer
        const html = reportDef.render(data, appConfig);
        reportPanel.innerHTML = html;

    } catch (e) {
        reportPanel.innerHTML = `<p style="color:red; text-align:center;">Error: ${e.message}</p>`;
    }
}

async function downloadPdf() {
    const content = reportPanel.innerHTML;
    if (!content || content.includes('Select a report')) {
        if(window.showToast) showToast("Please run a report first.", "warning");
        return;
    }

    const btn = document.querySelector('button[onclick="downloadPdf()"]');
    const origText = btn.textContent;
    btn.textContent = "Generating...";
    btn.disabled = true;

    // Wrap content in a basic HTML structure for the PDF renderer to ensure styles match
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
        const res = await fetch('/api/reports/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: fullHtml, title: reportSelect.value })
        });

        if (!res.ok) throw new Error("Server failed to generate PDF");

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Report-${reportSelect.value}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        if(window.showToast) showToast("PDF Downloaded successfully", "success");

    } catch (e) {
        alert("Error generating PDF: " + e.message);
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}