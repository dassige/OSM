(function () {
    window.ReportRegistry = window.ReportRegistry || {};

    window.ReportRegistry['survey-response-log'] = {
        title: 'Survey Response Log',
        description: 'Chronological log of who responded to each survey in the last defined number of days. Shows participation only — response content is never included.',
        params: [
            {
                key: 'days',
                label: 'Lookback Period (Days)',
                type: 'number',
                default: 30,
                prefKey: 'rpt_surv_days'
            }
        ],
        paginate: true,
        pageSize: 25,
        getItems: function (dataWrapper) { return dataWrapper.items || []; },
        renderHeader: function (dataWrapper) {
            const meta = dataWrapper.meta || {};
            return `
                <div class="rpt-header">
                    <h1>Survey Response Log</h1>
                    <p>Period: Last ${meta.days || 30} Days &bull; Generated: ${meta.generated}</p>
                </div>`;
        },
        renderItems: function (rows, dataWrapper, uiConfig) {
            const locale = (uiConfig && uiConfig.locale) || 'en-NZ';
            let html = `
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th width="20%">Date Submitted</th>
                            <th width="45%">Survey</th>
                            <th width="25%">Member</th>
                            <th width="10%">Type</th>
                        </tr>
                    </thead>
                    <tbody>`;

            if (rows.length === 0) {
                return html + '<tr><td colspan="4" style="text-align:center">No responses recorded in this period.</td></tr></tbody></table>';
            }

            rows.forEach(function (row) {
                const date = new Date(row.submitted_at).toLocaleDateString(locale, { timeZone: (uiConfig && uiConfig.timezone) || undefined });
                const typeLabel = row.is_anonymous
                    ? '<em style="color:#999;">Anonymous</em>'
                    : 'Identified';

                html += `<tr>
                    <td>${date}</td>
                    <td>${row.survey_name}</td>
                    <td>${window.formatMemberName ? window.formatMemberName(row.member_rank, row.member_last_name, row.member_first_name, row.member_name) : (row.member_name || '-')}</td>
                    <td>${typeLabel}</td>
                </tr>`;
            });

            return html + '</tbody></table>';
        },
        render: function (dataWrapper, uiConfig) {
            return this.renderHeader(dataWrapper, uiConfig) +
                this.renderItems(this.getItems(dataWrapper), dataWrapper, uiConfig);
        }
    };
})();
