// public/reports/report-planned-sessions.js

(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['planned-sessions'] = {
        title: "Skills Renewal Planner - Upcoming Sessions",
        description: "Lists future training sessions scheduled in the Planner, along with the members due to renew those skills.",
        
        render: function(dataWrapper, uiConfig) {
            const data = dataWrapper.items || [];
            const meta = dataWrapper.meta || {};
            
            const appName = uiConfig.loginTitle || "FENZ OSM Manager";
            const locale = uiConfig.locale || 'en-NZ';

            let html = `
                <div class="rpt-header">
                    <h1 style="margin:0; font-size:24px;">${appName}</h1>
                    <h2 style="margin:5px 0 0 0; font-size:18px;">Training Planner Report</h2>
                    <p style="margin:5px 0 0 0; color:#666;">
                        Generated: ${meta.generated} • Scope: Future Scheduled Sessions
                    </p>
                </div>`;

            if (data.length === 0) {
                return html + "<p style='text-align:center; padding:20px;'>No future training sessions found in the planner.</p>";
            }

            data.forEach(dayGroup => {
                // Format Date nicely (e.g. "Monday, 12 December 2025")
                const dateObj = new Date(dayGroup.date);
                const dateStr = dateObj.toLocaleDateString(locale, { 
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
                });

                html += `
                    <div style="break-inside: avoid; margin-bottom: 25px;">
                        <div style="background-color:#343a40; color:white; padding:8px 12px; font-weight:bold; font-size:16px; border-radius:4px 4px 0 0;">
                            ${dateStr}
                        </div>
                        
                        <div style="border:1px solid #ddd; border-top:none; padding:15px;">
                `;

                dayGroup.sessions.forEach(session => {
                    html += `
                        <div style="margin-bottom: 15px; border-bottom: 1px dashed #eee; padding-bottom: 15px;">
                            <h3 style="margin:0 0 8px 0; color:#007bff; font-size:15px;">
                                ${session.skill}
                            </h3>
                    `;

                    if (session.members.length === 0) {
                        html += `<div style="font-style:italic; color:#999; font-size:12px;">No members currently expiring for this skill.</div>`;
                    } else {
                        html += `
                            <table class="rpt-table" style="width:100%; margin:0;">
                                <thead>
                                    <tr style="background:#f8f9fa;">
                                        <th style="width:60%; padding:4px 8px; font-size:11px; border:none; border-bottom:1px solid #ddd;">Member</th>
                                        <th style="width:40%; padding:4px 8px; font-size:11px; border:none; border-bottom:1px solid #ddd;">Expiry Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                        session.members.forEach(m => {
                            const dObj = new Date(m.dueDate);
                            const dStr = isNaN(dObj) ? m.dueDate : dObj.toLocaleDateString(locale);
                            const critStyle = m.isCritical ? 'color:#dc3545; font-weight:bold;' : '';
                            
                            html += `
                                <tr>
                                    <td style="padding:4px 8px; border:none; border-bottom:1px solid #eee;">${m.name}</td>
                                    <td style="padding:4px 8px; border:none; border-bottom:1px solid #eee; ${critStyle}">${dStr}</td>
                                </tr>
                            `;
                        });

                        html += `</tbody></table>`;
                    }

                    html += `</div>`; // End Session Div
                });

                html += `</div></div>`; // End Day Container
            });

            return html;
        }
    };
})();