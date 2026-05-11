(function () {
  window.ReportRegistry = window.ReportRegistry || {};

  window.ReportRegistry["by-member"] = {
    title: "Expiring Skills - Grouped by Member",
    description:
      "Lists members with skills expiring within your configured threshold, sorted by Name.",
    params: [
      {
        key: "days",
        label: "Days to Expiry",
        type: "number",
        default: 30,
        prefKey: "rpt_mem_days",
      },
    ],
    paginate: true,
    pageSize: 10,
    getItems: function (dataWrapper) { return dataWrapper.items || []; },
    renderHeader: function (dataWrapper, uiConfig) {
      const meta = dataWrapper.meta || {};
      const appName = uiConfig.loginTitle || "OpReady";
      return `
        <div class="rpt-header">
          <h1 style="margin:0; font-size:24px;">${appName}</h1>
          <h2 style="margin:5px 0 0 0; font-size:18px;">Expiring Skills Report</h2>
          <p style="margin:5px 0 0 0; color:#666;">
            Grouped by Member • Limit: <strong>${meta.filterDays} Days</strong> • Generated: ${meta.generated}
          </p>
        </div>`;
    },
    renderItems: function (members, dataWrapper, uiConfig) {
      const locale = uiConfig.locale || "en-NZ";
      if (members.length === 0)
        return "<p>No expiring skills found within the threshold.</p>";
      let html = "";
      members.forEach((member) => {
        html += `
          <div style="break-inside: avoid;">
            <div class="rpt-group-header">${member.name}</div>
            <table class="rpt-table">
              <thead><tr><th width="70%">Skill Name</th><th width="30%">Due Date</th></tr></thead>
              <tbody>`;
        member.skills.forEach((skill) => {
          const criticalClass = skill.isCritical ? "critical" : "";
          const criticalText = skill.isCritical ? " (CRITICAL)" : "";
          const dateObj = new Date(skill.dueDate);
          const formattedDate = isNaN(dateObj) ? skill.dueDate : dateObj.toLocaleDateString(locale);
          html += `<tr><td class="${criticalClass}">${skill.skill}${criticalText}</td><td>${formattedDate}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      });
      return html;
    },
    render: function (dataWrapper, uiConfig) {
      const header = this.renderHeader(dataWrapper, uiConfig);
      const items = this.getItems(dataWrapper);
      if (items.length === 0)
        return header + "<p>No expiring skills found within the " + (dataWrapper.meta || {}).filterDays + " day threshold.</p>";
      return header + this.renderItems(items, dataWrapper, uiConfig);
    },
  };
})();
