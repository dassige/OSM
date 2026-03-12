// public/statistics/compliance-overview.js
(function () {
    window.StatRegistry = window.StatRegistry || {};
    window.StatRegistry['compliance-overview'] = {
        title: "Overall Compliance Overview",
        description: "A comprehensive snapshot of brigade readiness. The 'Member Compliance' chart shows the ratio of active members who are fully up-to-date versus those with at least one competency expiring within your configured threshold. The 'Skill Priority' chart breaks down every expiring skill by its 'Critical' status, helping you prioritize high-risk training requirements first.",
        renderHtml: function (data, config) {
            return `
                <div class="rpt-header" style="position: relative;">
                    <h1 style="margin:0; font-size:24px;">${config.loginTitle}</h1>
                    <h2 style="margin:5px 0 0 0; font-size:18px;">Compliance Dashboard</h2>
                    <p style="color:#666;">Threshold: <strong>${data.meta.threshold} Days</strong> | Active Members: ${data.meta.totalMembers}</p>
                    
                    <div style="position: absolute; top: 0; right: 0; text-align: right; font-size: 11px; color: #888; line-height: 1.4;">
                        Data Refreshed:<br>
                        <span style="font-weight: bold; color: #555;">${data.meta.generated}</span>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="chart-card"><div class="chart-title">Member Compliance</div><canvas id="chartCompliance"></canvas></div>
                    <div class="chart-card"><div class="chart-title">Expiring Skill Priority</div><canvas id="chartSkills"></canvas></div>
                </div>`;
        },
        initCharts: function (data) {
            // ... (keep existing chart initialization logic) ...
            new Chart(document.getElementById('chartCompliance'), {
                type: 'doughnut',
                data: {
                    labels: ['Compliant', 'Action Required'],
                    datasets: [{
                        data: [data.compliance.compliant, data.compliance.nonCompliant],
                        backgroundColor: ['#28a745', '#dc3545']
                    }]
                }
            });

            new Chart(document.getElementById('chartSkills'), {
                type: 'pie',
                data: {
                    labels: ['Critical', 'Standard'],
                    datasets: [{
                        data: [data.skillDistribution.critical, data.skillDistribution.standard],
                        backgroundColor: ['#6f42c1', '#17a2b8']
                    }]
                }
            });
        }
    };
})();