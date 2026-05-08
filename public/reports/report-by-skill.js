(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['by-skill'] = {
        title: "Expiring Skills - Grouped by Skill",
        description: "Lists skills expiring within a specific timeframe. Ordered by Skill Name, Member Rank, then Member Name.",
        params: [
            { key: 'days', label: 'Days to Expiry', type: 'number', default: 30, prefKey: 'rpt_skill_days' }
        ],
        paginate: true,
        pageSize: 10,
        getItems: function(dataWrapper) { return dataWrapper.items || []; },
        renderHeader: function(dataWrapper, uiConfig) {
            const meta = dataWrapper.meta || {};
            const appName = uiConfig.loginTitle || "FENZ OSM Manager";
            return `
              <div class="rpt-header">
                <h1 style="margin:0; font-size:24px;">${appName}</h1>
                <h2 style="margin:5px 0 0 0; font-size:18px;">Expiring Skills Report</h2>
                <p style="margin:5px 0 0 0; color:#666;">
                  Grouped by Skill • Limit: <strong>${meta.filterDays} Days</strong> • Generated: ${meta.generated}
                </p>
              </div>`;
        },
        renderItems: function(skillGroups, dataWrapper, uiConfig) {
            const locale = uiConfig.locale || 'en-NZ';
            if (skillGroups.length === 0) return "<p>No expiring skills found within the threshold.</p>";
            let html = '';
            skillGroups.forEach(skillGroup => {
                html += `
                  <div style="break-inside: avoid;">
                    <div class="rpt-group-header" style="background-color:#007bff;">${skillGroup.name}</div>
                    <table class="rpt-table">
                      <thead><tr><th width="60%">Member Name</th><th width="40%">Due Date</th></tr></thead>
                      <tbody>`;
                skillGroup.members.forEach(item => {
                    const dateObj = new Date(item.dueDate);
                    const formattedDate = isNaN(dateObj) ? item.dueDate : dateObj.toLocaleDateString(locale);
                    html += `<tr><td>${item.member}</td><td>${formattedDate}</td></tr>`;
                });
                html += `</tbody></table></div>`;
            });
            return html;
        },
        render: function(dataWrapper, uiConfig) {
            const header = this.renderHeader(dataWrapper, uiConfig);
            const items = this.getItems(dataWrapper);
            if (items.length === 0)
                return header + "<p>No expiring skills found within the " + (dataWrapper.meta || {}).filterDays + " day threshold.</p>";
            return header + this.renderItems(items, dataWrapper, uiConfig);
        }
    };
})();