(function () {
  window.ReportRegistry = window.ReportRegistry || {};

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.ReportRegistry["verification-history"] = {
    title: "Verification History",
    description:
      "Log of online verification forms processed in the last defined number of days.",
    params: [
      {
        key: "days",
        label: "Lookback Period (Days)",
        type: "number",
        default: 30,
        prefKey: "rpt_hist_days",
      },
    ],
    paginate: true,
    pageSize: 25,
    getItems: function (dataWrapper) { return dataWrapper.items || []; },
    renderHeader: function (dataWrapper) {
      const meta = dataWrapper.meta || {};
      return `
        <div class="rpt-header">
          <h1>Verification Activity Log</h1>
          <p>Period: Last ${meta.filterDays || 30} Days • Generated: ${meta.generated}</p>
        </div>`;
    },
    renderItems: function (rows, dataWrapper, uiConfig) {
      let html = `
        <table class="rpt-table">
          <thead>
            <tr>
              <th width="15%">Date</th>
              <th width="20%">Member</th>
              <th width="30%">Skill</th>
              <th width="10%">Status</th>
              <th width="10%">Score</th>
              <th width="15%">Details</th>
            </tr>
          </thead>
          <tbody>`;
      if (rows.length === 0)
        return html + "<tr><td colspan='6' style='text-align:center'>No activity recorded.</td></tr></tbody></table>";
      rows.forEach((row) => {
        const locale = (uiConfig && uiConfig.locale) || 'en-NZ';
        const tz = (uiConfig && uiConfig.timezone) || undefined;
        const date = new Date(row.form_reviewed_datetime).toLocaleDateString(locale, { timeZone: tz });
        const statusColor = row.form_status === "accepted" ? "green" : "red";
        const score = row.current_score ? parseFloat(row.current_score).toFixed(1) : "-";
        let aiNote = "";
        if (row.ai_feedback) {
          try {
            const fb = JSON.parse(row.ai_feedback);
            if (Object.keys(fb).length > 0) aiNote = " (AI Evaluated)";
          } catch (e) {}
        }
        const memberDisplay = window.formatMemberName
          ? window.formatMemberName(row.member_rank, row.member_last_name, row.member_first_name, row.member_name)
          : row.member_name;
        html += `<tr>
          <td>${date}</td>
          <td>${escHtml(memberDisplay)}</td>
          <td>${escHtml(row.skill_name)}</td>
          <td style="color:${statusColor}; font-weight:bold; text-transform:uppercase;">${escHtml(row.form_status)}</td>
          <td>${score}</td>
          <td style="font-size:10px;">Attempt #${row.tries}${aiNote}</td>
        </tr>`;
      });
      return html + `</tbody></table>`;
    },
    render: function (dataWrapper, uiConfig) {
      return this.renderHeader(dataWrapper, uiConfig) + this.renderItems(this.getItems(dataWrapper), dataWrapper, uiConfig);
    },
  };
})();
