(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['training-attendance'] = {
        title: "Training Attendance Sheet",
        description: "Printable sign-in sheet for scheduled training sessions. Includes columns for signatures and pass/fail recording.",
        
        render: function(dataWrapper, uiConfig) {
            const data = dataWrapper.items || [];
            const locale = (uiConfig && uiConfig.locale) || 'en-NZ';
            const tz = (uiConfig && uiConfig.timezone) || undefined;
            
            let html = `
                <div class="rpt-header">
                    <h1>Training Attendance Record</h1>
                    <p>Generated: ${dataWrapper.meta.generated}</p>
                </div>`;

            if(data.length === 0) return html + "<p>No planned sessions found.</p>";

            data.forEach(day => {
                const dateStr = new Date(day.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
                
                day.sessions.forEach(session => {
                    html += `
                        <div style="break-inside: avoid; margin-bottom: 30px; border: 1px solid #000; padding: 15px;">
                            <h3 style="margin:0 0 10px 0; border-bottom: 1px solid #000; padding-bottom: 5px;">
                                ${session.skill} <span style="float:right; font-weight:normal; font-size:14px;">Date: ${dateStr}</span>
                            </h3>
                            <p style="font-size:11px; margin-bottom:10px;"><strong>Instructor Name:</strong> ______________________ <strong>Signature:</strong> ______________________</p>
                            
                            <table class="rpt-table" style="border: 1px solid #000;">
                                <thead>
                                    <tr style="background:#eee;">
                                        <th width="30%">Member Name</th>
                                        <th width="15%">Expiry Date</th>
                                        <th width="20%">Signature</th>
                                        <th width="10%">Pass/Fail</th>
                                        <th width="25%">Comments</th>
                                    </tr>
                                </thead>
                                <tbody>`;
                    
                    if (session.members.length === 0) {
                        // Empty rows for walk-ins
                        for(let i=0; i<5; i++) {
                            html += `<tr><td style="height:30px;"></td><td></td><td></td><td></td><td></td></tr>`;
                        }
                    } else {
                        session.members.forEach(m => {
                            html += `<tr>
                                <td style="height:35px;">${m.name}</td>
                                <td>${m.dueDate}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>`;
                        });
                        // Add extra blank rows for unexpected attendees
                        html += `<tr><td style="height:35px;">(Walk-in)</td><td></td><td></td><td></td><td></td></tr>`;
                        html += `<tr><td style="height:35px;">(Walk-in)</td><td></td><td></td><td></td><td></td></tr>`;
                    }

                    html += `</tbody></table></div>`;
                });
            });

            return html;
        }
    };
})();