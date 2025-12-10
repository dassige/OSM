(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['by-member'] = {
        title: "Expiring Skills - Grouped by Member",
        description: "Lists members with skills expiring within your configured threshold, sorted by Name.",
        
        render: function(dataWrapper, uiConfig) {
            const data = dataWrapper.items || [];
            const meta = dataWrapper.meta || {};
            
            const appName = uiConfig.loginTitle || "FENZ OSM Manager";
            const locale = uiConfig.locale || 'en-NZ'; // Use config locale
            
            let html = `
                <div class="rpt-header">
                    <h1 style="margin:0; font-size:24px;">${appName}</h1>
                    <h2 style="margin:5px 0 0 0; font-size:18px;">Expiring Skills Report</h2>
                    <p style="margin:5px 0 0 0; color:#666;">
                        Grouped by Member • Limit: <strong>${meta.filterDays} Days</strong> • Generated: ${meta.generated}
                    </p>
                </div>`;

            if(data.length === 0) return html + "<p>No expiring skills found within the " + meta.filterDays + " day threshold.</p>";

            data.forEach(member => {
                html += `
                    <div style="break-inside: avoid;">
                        <div class="rpt-group-header">${member.name}</div>
                        <table class="rpt-table">
                            <thead>
                                <tr>
                                    <th width="70%">Skill Name</th>
                                    <th width="30%">Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                member.skills.forEach(skill => {
                    const criticalClass = skill.isCritical ? 'critical' : '';
                    const criticalText = skill.isCritical ? ' (CRITICAL)' : '';
                    
                    // [UPDATED] Format date based on locale
                    const dateObj = new Date(skill.dueDate);
                    const formattedDate = isNaN(dateObj) ? skill.dueDate : dateObj.toLocaleDateString(locale);

                    html += `
                        <tr>
                            <td class="${criticalClass}">${skill.skill}${criticalText}</td>
                            <td>${formattedDate}</td>
                        </tr>
                    `;
                });

                html += `</tbody></table></div>`;
            });

            return html;
        }
    };
})();