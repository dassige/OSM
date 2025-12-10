(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['by-skill'] = {
        title: "Expiring Skills - Grouped by Skill",
        description: "Lists skills expiring within your configured threshold, grouped alphabetically.",
        
        // [UPDATED] Handle new data structure
        render: function(dataWrapper, uiConfig) {
            const data = dataWrapper.items || [];
            const meta = dataWrapper.meta || {};

            const appName = uiConfig.loginTitle || "FENZ OSM Manager";

            let html = `
                <div class="rpt-header">
                    <h1 style="margin:0; font-size:24px;">${appName}</h1>
                    <h2 style="margin:5px 0 0 0; font-size:18px;">Expiring Skills Report</h2>
                    <p style="margin:5px 0 0 0; color:#666;">
                        Grouped by Skill • Limit: <strong>${meta.filterDays} Days</strong> • Generated: ${meta.generated}
                    </p>
                </div>`;

            if(data.length === 0) return html + "<p>No expiring skills found within the " + meta.filterDays + " day threshold.</p>";

            data.forEach(skillGroup => {
                html += `
                    <div style="break-inside: avoid;">
                        <div class="rpt-group-header" style="background-color:#007bff;">${skillGroup.name}</div>
                        <table class="rpt-table">
                            <thead>
                                <tr>
                                    <th width="60%">Member Name</th>
                                    <th width="40%">Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                skillGroup.members.forEach(item => {
                    html += `
                        <tr>
                            <td>${item.member}</td>
                            <td>${item.dueDate}</td>
                        </tr>
                    `;
                });

                html += `</tbody></table></div>`;
            });

            return html;
        }
    };
})();