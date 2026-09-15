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

    function pctColor(pct) {
        if (pct === null || pct === undefined) return '#999';
        return pct >= 80 ? 'green' : pct >= 50 ? '#e6a817' : '#dc3545';
    }

    window.ReportRegistry['quiz-performance'] = {
        title: 'Quiz Performance',
        description: 'Per-game participation and scoring across all Quiz Games sessions and team setups, plus the most-missed questions in each game.',
        params: [
            {
                key: 'days',
                label: 'Lookback Period (Days)',
                type: 'number',
                default: 90,
                prefKey: 'rpt_quiz_days'
            }
        ],
        paginate: false,
        render: function (dataWrapper, uiConfig) {
            const meta = dataWrapper.meta || {};
            const items = dataWrapper.items || [];

            let html = `
                <div class="rpt-header">
                    <h1>Quiz Performance</h1>
                    <p>Period: Last ${meta.days || 90} Days &bull; Generated: ${meta.generated}</p>
                </div>`;

            if (items.length === 0) {
                return html + '<p style="text-align:center; padding:40px; color:#999;">No quiz activity recorded in this period.</p>';
            }

            html += `
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th width="26%">Game</th>
                            <th width="8%">Type</th>
                            <th width="8%">Sessions</th>
                            <th width="9%">Invited</th>
                            <th width="9%">Submitted</th>
                            <th width="8%">Pending</th>
                            <th width="10%">Avg Score</th>
                            <th width="11%">Best / Worst</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(function (row) {
                const typeColor = row.gameType === 'timed' ? '#fd7e14' : '#17a2b8';
                const bestWorst = (row.bestScorePct !== null && row.worstScorePct !== null)
                    ? `${row.bestScorePct}% / ${row.worstScorePct}%`
                    : '-';

                html += `<tr>
                    <td>${escHtml(row.gameName)}${row.enabled ? '' : ' <span style="color:#999;">(disabled)</span>'}</td>
                    <td><span style="color:${typeColor}; font-weight:bold; text-transform:capitalize;">${escHtml(row.gameType)}</span></td>
                    <td>${row.sessions}</td>
                    <td>${row.totalInvited}</td>
                    <td>${row.totalSubmitted}</td>
                    <td>${row.totalPending}</td>
                    <td style="font-weight:bold; color:${pctColor(row.avgScorePct)};">${row.avgScorePct !== null ? row.avgScorePct + '%' : '-'}</td>
                    <td>${bestWorst}</td>
                </tr>`;
            });

            html += '</tbody></table>';

            const gamesWithMissedQuestions = items.filter((row) => (row.worstQuestions || []).length > 0);
            if (gamesWithMissedQuestions.length > 0) {
                html += '<h2 style="margin-top:30px;">Most Missed Questions</h2>';
                gamesWithMissedQuestions.forEach(function (row) {
                    html += `<h3 style="margin:16px 0 6px 0; font-size:0.95em;">${escHtml(row.gameName)}</h3>
                        <table class="rpt-table">
                            <thead>
                                <tr>
                                    <th width="70%">Question</th>
                                    <th width="15%">Answered</th>
                                    <th width="15%">Correct %</th>
                                </tr>
                            </thead>
                            <tbody>`;
                    row.worstQuestions.forEach(function (q) {
                        html += `<tr>
                            <td>${escHtml(q.description)}</td>
                            <td>${q.answeredCount}</td>
                            <td style="font-weight:bold; color:${pctColor(q.correctPct)};">${q.correctPct}%</td>
                        </tr>`;
                    });
                    html += '</tbody></table>';
                });
            }

            return html;
        }
    };
})();
