(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['critical-overdue'] = {
        title: "Critical Skills Overdue",
        description: "High-priority report listing only Critical (C) skills that have already expired. Requires immediate action.",
        
        render: function(dataWrapper, uiConfig) {
            const data = dataWrapper.items || [];
            const meta = dataWrapper.meta || {};
            const appName = uiConfig.loginTitle || "OpReady";

            let html = `
                <div class="rpt-header">
                    <h1 style="margin:0; font-size:24px; color:#dc3545;">${appName}</h1>
                    <h2 style="margin:5px 0 0 0; font-size:18px;">CRITICAL OVERDUE REPORT</h2>
                    <p style="margin:5px 0 0 0; color:#666;">Generated: ${meta.generated}</p>
                </div>`;

            if(data.length === 0) return html + "<div style='padding:20px; text-align:center; color:green; font-weight:bold;'>No critical skills are currently overdue. Good job!</div>";

            data.forEach(group => {
                html += `
                    <div style="break-inside: avoid; margin-bottom:15px;">
                        <div class="rpt-group-header" style="background:#dc3545;">${group.name}</div>
                        <table class="rpt-table">
                            <thead>
                                <tr>
                                    <th width="70%">Critical Skill</th>
                                    <th width="30%">Expired On</th>
                                </tr>
                            </thead>
                            <tbody>`;
                
                group.skills.forEach(skill => {
                    html += `<tr>
                        <td style="font-weight:bold;">${skill.skill}</td>
                        <td style="color:#dc3545; font-weight:bold;">${skill.dueDate}</td>
                    </tr>`;
                });

                html += `</tbody></table></div>`;
            });
            return html;
        }
    };
})();