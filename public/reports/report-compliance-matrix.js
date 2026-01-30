// public/reports/report-compliance-matrix.js
(function() {
    window.ReportRegistry = window.ReportRegistry || {};
    
    window.ReportRegistry['compliance-matrix'] = {
        title: "Brigade Compliance Matrix",
        description: "A multi-page grid view with vertical headers. Splits skills into groups of 10. Ordered by Rank, then Name.",
        
        render: function(dataWrapper, uiConfig) {
            const headers = dataWrapper.headers || [];
            const rows = dataWrapper.rows || [];
            const meta = dataWrapper.meta || {};
            
            const SKILLS_PER_PAGE = 10;
            const totalSkills = headers.length;
            const totalPages = Math.ceil(totalSkills / SKILLS_PER_PAGE);
            
            let html = `
                <div class="rpt-header">
                    <h1>${uiConfig.loginTitle || "FENZ OSM"} - Compliance Matrix</h1>
                    <p>Generated: ${meta.generated} • Total Members: ${rows.length}</p>
                </div>`;

            for (let i = 0; i < totalSkills; i += SKILLS_PER_PAGE) {
                const chunkIndex = Math.floor(i / SKILLS_PER_PAGE) + 1;
                const sliceEnd = Math.min(i + SKILLS_PER_PAGE, totalSkills);
                const headerSlice = headers.slice(i, sliceEnd);
                const pageStyle = i > 0 ? 'page-break-before: always; margin-top: 30px;' : '';
                
                html += `
                <div style="${pageStyle}">
                    <h3 style="margin:0 0 10px 0; font-size:14px; color:#666;">
                        Page ${chunkIndex} of ${totalPages} (Skills ${i + 1} - ${sliceEnd})
                    </h3>
                    
                    <table class="rpt-table" style="font-size:10px; width:100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="background:#343a40; color:white; width:20%; text-align:left; vertical-align:bottom; padding:8px;">
                                    Member Name
                                </th>`;
                
                headerSlice.forEach(h => {
                    html += `
                        <th style="background:#eee; color:#333; width:8%; vertical-align:bottom; padding:5px 2px; border:1px solid #ccc; height:140px;">
                            <div style="
                                writing-mode: vertical-rl; 
                                transform: rotate(180deg);
                                text-align: left;
                                max-height: 130px; 
                                line-height: 1.1em;
                                width: 100%;
                                white-space: normal;
                                margin: 0 auto;
                                overflow: hidden;
                                font-size: 10px;
                            " title="${h}">
                                ${h}
                            </div>
                        </th>`;
                });
                
                html += `</tr></thead><tbody>`;

                rows.forEach((r, rowIndex) => {
                    const bg = rowIndex % 2 === 0 ? '#fff' : '#f8f9fa';
                    html += `<tr style="background-color:${bg};">
                        <td style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:6px 8px; border:1px solid #ddd;">
                            ${r.member}
                        </td>`;
                    
                    const skillSlice = r.skills.slice(i, sliceEnd);
                    skillSlice.forEach(s => {
                        let cellStyle = "border:1px solid #ddd; text-align:center; padding:6px 2px;";
                        let content = "";
                        
                        if (s.status === 'ok') {
                            cellStyle += "background:#d4edda; color:#155724; font-weight:bold;";
                            content = "✓";
                        } else if (s.status === 'expiring') {
                            cellStyle += "background:#fff3cd; color:#856404; font-weight:bold;";
                            content = "DUE";
                        } else if (s.status === 'expired') {
                            cellStyle += "background:#f8d7da; color:#721c24; font-weight:bold;";
                            content = "EXP";
                        } else {
                            cellStyle += "color:#ccc;";
                            content = "·";
                        }
                        
                        html += `<td style="${cellStyle}" title="${s.name}: ${s.date}">${content}</td>`;
                    });
                    html += `</tr>`;
                });

                // [UPDATED] Key now uses meta.threshold variable
                html += `</tbody></table>
                    <div style="font-size:10px; color:#666; text-align:right; margin-top:5px;">
                        Key: ✓ = Current, DUE = Expiring < ${meta.threshold} days, EXP = Expired, · = Missing
                    </div>
                </div>`;
            }
            
            return html;
        }
    };
})();