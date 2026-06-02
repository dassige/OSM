(function () {
    window.ReportRegistry = window.ReportRegistry || {};

    window.ReportRegistry['survey-participation'] = {
        title: 'Survey Participation Overview',
        description: 'All published survey campaigns showing invitation counts, response rates, and archive status.',
        paginate: false,
        render: function (dataWrapper, uiConfig) {
            const meta = dataWrapper.meta || {};
            const items = dataWrapper.items || [];
            const locale = (uiConfig && uiConfig.locale) || 'en-NZ';

            let html = `
                <div class="rpt-header">
                    <h1>Survey Participation Overview</h1>
                    <p>All survey campaigns &bull; Generated: ${meta.generated}</p>
                </div>`;

            if (items.length === 0) {
                return html + '<p style="text-align:center; padding:40px; color:#999;">No survey campaigns found.</p>';
            }

            html += `
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th width="38%">Survey Name</th>
                            <th width="14%">Published</th>
                            <th width="9%">Sent</th>
                            <th width="9%">Responded</th>
                            <th width="12%">Response Rate</th>
                            <th width="10%">Type</th>
                            <th width="8%">Status</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(function (row) {
                const published = row.published_at
                    ? new Date(row.published_at).toLocaleDateString(locale, { timeZone: (uiConfig && uiConfig.timezone) || undefined })
                    : '-';
                const sent = row.total_sent || 0;
                const submitted = row.total_submitted || 0;
                const rate = sent > 0 ? Math.round((submitted / sent) * 100) : 0;
                const rateColor = rate >= 80 ? 'green' : rate >= 50 ? '#e6a817' : '#dc3545';
                const statusLabel = row.is_archived
                    ? '<span style="color:#999;">Archived</span>'
                    : '<span style="color:green;">Active</span>';
                const typeLabel = row.is_anonymous ? 'Anonymous' : 'Identified';

                html += `<tr>
                    <td>${row.name}</td>
                    <td>${published}</td>
                    <td>${sent}</td>
                    <td>${submitted}</td>
                    <td style="font-weight:bold; color:${rateColor};">${rate}%</td>
                    <td>${typeLabel}</td>
                    <td>${statusLabel}</td>
                </tr>`;
            });

            html += '</tbody></table>';
            return html;
        }
    };
})();
