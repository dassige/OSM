/**
 * CENTRALIZED HELP CONFIGURATION
 */
const helpContent = {
    // --- Dashboard (index.html or /) ---
    "index": {
        title: "Dashboard Help",
        body: `
            <p><strong>Overview:</strong> This dashboard shows all members with skills expiring within the threshold (default 30 days).</p>
            <ul>
                <li><strong>Days to Expiry:</strong> Change this number and click 'Reload' to see skills expiring further in the future.</li>
                <li><strong>Reload Expiring Skills:</strong> Fetches the latest data from the OSM Dashboard.</li>
                <li><strong>Send Notifications:</strong> Select the <strong>Email</strong> or <strong>WhatsApp</strong> checkboxes for members and click 'Send Notifications' to process them in bulk.
                    <br><em>Note: The default selection for each member is determined by their configured <strong>Notification Preferences</strong> (set in Manage Members).</em>
                </li>
                <li><strong>Quick Actions:</strong> Use the round <span style="background:#007bff; color:white; border-radius:50%; padding:0 5px; font-size:0.8em;">✉</span> or <span style="background:#25D366; color:white; border-radius:50%; padding:0 5px; font-size:0.8em;">✆</span> buttons to send a single reminder immediately.</li>
                <li><strong>Filters:</strong> Use the toggle buttons at the top right of the table:
                    <ul>
                        <li><strong>Hide Empty:</strong> Hides members who have no expiring skills listed.</li>
                        <li><strong>Has Form Only:</strong> Hides skills that do not have a configured Online Form URL.</li>
                        <li><strong>Expired Only:</strong> Shows only skills that have already passed their due date.</li>
                    </ul>
                </li>            
            </ul>
            <p><em>Note:</em> Skills in <strong>bold</strong> are Critical. 
            <span style="display: inline-flex; align-items: center; vertical-align: bottom;">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #007bff;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
            </span> indicates a direct form link is available.
            Dates highlighted in <span style="background-color:#dc3545; color:white; padding:0 4px; border-radius:2px; font-size:0.9em;">Red</span> are overdue.</p>
            
            <div style="background-color: #fff3cd; padding: 10px; border-radius: 4px; margin-top: 10px; border: 1px solid #ffeeba; color: #856404; font-size: 0.9em;">
                <strong>Demo Mode Note:</strong><br>
                If running in Demo Mode, the data shown is static (from a local file). However, the <strong>Due Dates</strong> are automatically adjusted to appear relative to today's date, allowing you to effectively test the expiry logic.
            </div>
        `
    },
    // --- Member Management ---
    "members": {
        title: "Manage Members Help",
        body: `
            <p><strong>Import from OSM:</strong> Scans the live dashboard for any members not yet in your list and allows you to import them.</p>
            <p><strong>Enabled Toggle:</strong> Use the switch to enable/disable a member. Disabled members are ignored during checks.</p>
            <hr>
            <p><strong>Add/Edit Member:</strong> Manually manage member details.</p>
            <ul>
                <li><strong>Name:</strong> Must match the OSM Dashboard exactly.</li>
                <li><strong>Notification Preference:</strong> Select which channels (<strong>Email</strong>, <strong>WhatsApp</strong>) this member should receive notifications on by default.</li>
            </ul>
            <p><strong>Prefs Column:</strong> Shows icons indicating enabled channels: <span style="color:#6f42c1; font-weight:bold;">✉</span> (Email) and <span style="color:#25D366; font-weight:bold;">✆</span> (WhatsApp).</p>
            <hr>
            <p><strong>Import CSV:</strong> Bulk upload members. <br>Format: <code>name, email, mobile, enabled</code>.</p>
            <p><strong>Export CSV:</strong> Download the current list of members for backup or editing.</p>
        `
    },
    // --- Skill Management ---
    "skills": {
        title: "Manage Skills Help",
        body: `
            <p><strong>Import from OSM:</strong> Scans the live dashboard for new skills not in your table. Auto-detects 'Critical' skills ending in <code>(C)</code>.</p>
            <p><strong>Enabled Toggle:</strong> Use the switch to enable/disable tracking for a skill without deleting it.</p>
            <hr>
            <p><strong>Add Skill:</strong> Define a new skill to track. The name must match the OSM Dashboard exactly.</p>
            <p><strong>Import CSV:</strong> Bulk upload skills. <br>Format: <code>name, url, critical_skill, enabled</code>.</p>
            <p><strong>Form URL:</strong> Paste the Online Form link here.</p>
            <p><strong>URL Templating:</strong> You can pre-fill form fields using variables:</p>
            <ul>
                <li><code>{{member-name}}</code> - Inserts the member's name.</li>
                <li><code>{{member-email}}</code> - Inserts the member's email.</li>
            </ul>
            <p><em>Example:</em> <code>https://docs.google.com/forms/d/e/...?entry.123={{member-name}}</code></p>
        `
    },
    // --- Templates ---
    "templates": {
        title: "Templates Help",
        body: `
            <p><strong>Overview:</strong> Customize the automated messages sent by the system for both Email and WhatsApp.</p>
            <p><strong>Tabs:</strong> Use the tabs at the top to switch between different template types.</p>
            
            <h3>Expiring Skills (Email & WhatsApp)</h3>
            <ul>
                <li><strong>Filter:</strong> Check <em>"Include only skills with Form URL"</em> to completely exclude any skill that doesn't have a link configured.</li>
                <li><strong>Dual Row Templates:</strong> Customize how each skill row appears based on whether it has a URL or not.</li>
                <li><strong>Next Planned Dates:</strong> For the "No URL" rows, you can use the <code>{{next-planned-dates}}</code> variable. This automatically inserts any future training sessions for that skill scheduled in the <strong>Skills Renewal Planner</strong>.</li>
            </ul>

            <h3>WhatsApp Specifics</h3>
            <p>Customize the text message sent to mobile phones.</p>
            <ul>
                <li><strong>Formatting:</strong> WhatsApp supports simple markdown: <code>*bold*</code>, <code>_italic_</code>, <code>~strike~</code>. HTML is not supported.</li>
            </ul>

            <h3>General Editing</h3>
            <p><strong>Drag & Drop Variables:</strong> Drag the gray chips (e.g., <code>{{name}}</code>) into the editor to insert dynamic placeholders.</p>
        `
    },
    // --- System Tools ---
    "system-tools": {
        title: "System Tools Help",
        body: `
            <p><strong>Backup:</strong> Downloads the entire database file. Keep this safe.</p>
            <p><strong>Restore:</strong> Upload a <code>.db</code> file to overwrite the current system. <br><strong style="color:red">Warning:</strong> This cannot be undone.</p>
            
            <div style="background-color: #fff3cd; padding: 10px; border-radius: 4px; margin-top: 10px; border: 1px solid #ffeeba; color: #856404; font-size: 0.9em;">
                <strong>Demo Mode:</strong> In Demo Mode, backups and restores apply to the sandboxed <code>demo.db</code>, not your production data.
            </div>
        `
    },
    // --- Event Log ---
    "event-log": {
        title: "Event Log Help",
        body: `
            <p><strong>Audit Trail:</strong> View a history of system actions (emails sent, members added, backups created, etc.).</p>
            <ul>
                <li><strong>Filtering:</strong> Use the controls at the top to filter by <strong>Event Type</strong>, <strong>User</strong>, or <strong>Date</strong>.</li>
                <li><strong>Pagination:</strong> Change the number of rows per page via the dropdown.</li>
            </ul>
            <p><strong>Super Admin Tools (Yellow Bar):</strong></p>
            <ul>
                <li><strong>Prune Old:</strong> Delete events older than the specified number of days to save space.</li>
                <li><strong>Purge All:</strong> Completely wipe the event log database. <em>Use with caution.</em></li>
                <li><strong>Export JSON:</strong> Download a full copy of the logs matching your current filters.</li>
            </ul>
        `
    },
    // --- User Management ---
    "users": {
        title: "User Management Help",
        body: `
            <p><strong>User Roles:</strong></p>
            <ul>
                <li><strong>Guest:</strong> Read-only access. Can view the Dashboard and reload skill data, but cannot send emails or view the console.</li>
                <li><strong>Simple:</strong> Operational access. Can send emails on the Dashboard but cannot access management pages.</li>
                <li><strong>Admin:</strong> Management access. Can manage Members, Skills, Templates, and Users. Cannot access System Tools.</li>
                <li><strong>Super Admin:</strong> Full system access (including Backups/Restore). Defined in environment variables.</li>
            </ul>
            <hr>
            <p><strong>Add User:</strong> Create new users. A random password will be generated and emailed to them.</p>
            <p><strong>Edit User:</strong> Change a user's name, email, or role.</p>
            <p><strong>Reset Password:</strong> Generate a new random password and email it to the user.</p>
        `
    },
    // --- User Profile ---
    "profile": {
        title: "Profile Help",
        body: `
            <p>Update your display name or change your password.</p>
            <p><strong>Note:</strong> Your email address (username) cannot be changed once created.</p>
        `
    },
    // --- Login ---
    "login": {
        title: "Login Help",
        body: `
            <p>Please sign in with your credentials.</p>
            <p><strong>Forgot Password?</strong> Click the link below the form to have a temporary password sent to your email.</p>
            
            <div style="background-color: #fff3cd; padding: 10px; border-radius: 4px; margin-top: 10px; border: 1px solid #ffeeba; color: #856404; font-size: 0.9em;">
                <strong>Demo Mode:</strong><br>
                If the application is running in Demo Mode, you can click the <strong>"Reveal Super-Admin demo credentials"</strong> link at the bottom of the page to view the login details.
            </div>
        `
    },
    // --- Third Parties ---
    "third-parties": {
        title: "Third Party Services Help",
        body: `
            <p><strong>WhatsApp Integration:</strong></p>
            <p>This service enables the system to send automated expiring skill notifications directly to member's WhatsApp accounts.</p>
            
            <h3>Connection Steps</h3>
            <ol>
                <li>Click <strong>Start Service</strong> to launch the secure WhatsApp client on the server.</li>
                <li>Wait for the <strong>QR Code</strong> to appear on the screen.</li>
                <li>Open WhatsApp on your phone, go to <strong>Linked Devices</strong> > <strong>Link a Device</strong>, and scan the code.</li>
                <li>Once connected, the status will turn <span style="color:#28a745; font-weight:bold;">Green</span> and display the connected account name and number.</li>
            </ol>

            <h3>Testing & Configuration</h3>
            <ul>
                <li><strong>Test Integration:</strong> Click this button to send a verification message to any mobile number you choose. This confirms the system can successfully send messages.</li>
                <li><strong>Auto-Disconnect Preference:</strong> If enabled, the WhatsApp session will automatically log out when you sign out of the FENZ OSM Manager. This prevents your session from staying active on the server when you are not using it.</li>
            </ul>

            <p><strong>Note:</strong> The phone associated with the WhatsApp account must be on and connected to the internet for messages to send.</p>
        `
    },
    // --- : Skills Renewal Planner ---
    "training-planner": {
        title: "Skills Renewal Planner Help",
        body: `
            <p><strong>Overview:</strong> Plan in-person training sessions by dragging expiring skills onto a calendar, or review upcoming sessions in a list.</p>
            
            <h3>View Modes</h3>
            <p>Use the buttons in the top toolbar to switch between views:</p>
            <ul>
                <li><strong>Calendar:</strong> The standard weekly interface for scheduling sessions via drag-and-drop.</li>
                <li><strong>Review List:</strong> A chronological list of all future days that have scheduled sessions.</li>
            </ul>

            <h3>Calendar View</h3>
            <p><strong>Left Panel: Expiring Skills</strong></p>
            <ul>
                <li><strong>Cards:</strong> Shows skills without an online form expiring soon.</li>
                <li><strong>Drag & Drop:</strong> Drag a skill card to a calendar day to schedule a session. (Past dates are disabled).</li>
                <li><strong>View Members:</strong> Click the colored number box to see exactly who needs the skill.</li>
            </ul>

            <p><strong>Right Panel: Calendar</strong></p>
            <ul>
                <li><strong>Training Day Filter:</strong> Toggle "Show only [Day]" to hide irrelevant days and expand the view.</li>
                <li><strong>Manage Sessions:</strong> Click a scheduled skill to view members, or the red <strong>&times;</strong> to delete it.</li>
                <li><strong>Navigation:</strong> Use the Teal buttons to change weeks, or the Calendar Icon to jump to Today.</li>
            </ul>

            <h3>Planned Sessions Review (List View)</h3>
            <p>Displays a summary of all future training days.</p>
            <ul>
                <li><strong>Jump to Calendar:</strong> Click on any <strong>Date Header</strong> (e.g., "Monday, 12 Dec") to instantly switch back to the Calendar View focused on that specific week.</li>
                <li><strong>Pagination:</strong> Use the controls at the bottom to navigate through pages of days.</li>
                <li><strong>Preferences:</strong> Use the "Days per page" dropdown to control how much data is loaded at once (saved to your profile).</li>
                <li><strong>Member Counts:</strong> The "View Members" button now displays the exact count of people expiring for that skill (e.g., "View Members: 5").</li>
            </ul>

            <hr>
            <p><em>Note:</em> Scheduled trainings are saved immediately and can be included in notifications using the <code>{{next-planned-dates}}</code> variable.</p>
        `
    },
    // ---  Reports Page ---
    "reports": {
        title: "Reports Help",
        body: `
            <p><strong>Reports Console:</strong> Generate printable and downloadable reports based on the current expiring skills data.</p>
            <ul>
                <li><strong>Select Report:</strong> Choose a report type from the dropdown (e.g., grouped by Member or by Skill).</li>
                <li><strong>Run Report:</strong> Generates the report on-screen using your current "Days to Expiry" preference from the Dashboard.</li>
                <li><strong>Print:</strong> Opens your browser's print dialog (optimized for A4 paper).</li>
                <li><strong>Export PDF:</strong> Generates a high-quality PDF file on the server and downloads it to your device.</li>
            </ul>
            <p><em>Note:</em> Reports exclude disabled members and skills.</p>
        `
    },
    // --- Forms Manager ---
    "forms-manage": {
        title: "Forms Manager Help",
        body: `
            <p><strong>Overview:</strong> Create and manage internal skill verification forms.</p>
            <ul>
                <li><strong>Builder:</strong> Drag and drop fields from the toolbox to create your form structure.</li>
                <li><strong>Ordering:</strong> Click the drag handle (☰) on a field header to reorder it.</li>
                <li><strong>Status:</strong> Use the toggle at the top right to Enable/Disable a form. Disabled forms cannot be accessed by volunteers.</li>
                <li><strong>Integration:</strong> Click the Link icon (🔗) to copy the public URL. Paste this URL into the 'Form URL' field on the <strong>Manage Skills</strong> page.</li>
            </ul>
            <p><strong>Field Types:</strong></p>
            <ul>
                <li><strong>Text/Paragraph:</strong> Standard text inputs.</li>
                <li><strong>Info Block:</strong> Use this to insert headers, instructions, or reading material (no input required).</li>
                <li><strong>Yes/No:</strong> A simple boolean toggle.</li>
            </ul>
        `
    },
    "live-forms": {
        title: "Live Forms Help",
        body: `
            <p><strong>Overview:</strong> View and manage the specific form instances sent to members for expiring skills.</p>
            <ul>
                <li><strong>Status:</strong>
                    <ul>
                        <li><span style="color:#17a2b8; font-weight:bold;">OPEN</span>: The form has been sent but not yet submitted.</li>
                        <li><span style="color:#28a745; font-weight:bold;">SUBMITTED</span>: The member has completed the form.</li>
                        <li><span style="color:#6c757d; font-weight:bold;">DISABLED</span>: Administratively closed.</li>
                    </ul>
                </li>
                <li><strong>Filters:</strong> Use the toolbar to filter by Date Sent, Member, Skill, or Status.</li>
                <li><strong>Editing:</strong> Click the pencil icon to manually change the status of a form (e.g., to re-open a submitted form or disable a sent one).</li>
            </ul>
        `
    },
    // --- Default ---
    "default": {
        title: "Help",
        body: "<p>No specific help content is available for this page.</p>"
    }
};

// --- LOGIC: Inject Button and Modal ---

(function () {
    // 1. Determine Current Page Key
    const path = window.location.pathname;
    let key = "default";

    if (path === "/" || path.endsWith("index.html")) key = "index";
    else if (path.includes("members")) key = "members";
    else if (path.includes("skills")) key = "skills";
    else if (path.includes("templates")) key = "templates";
    else if (path.includes("system-tools")) key = "system-tools";
    else if (path.includes("event-log")) key = "event-log";
    else if (path.includes("users")) key = "users";
    else if (path.includes("profile")) key = "profile";
    else if (path.includes("login")) key = "login";
    else if (path.includes("third-parties")) key = "third-parties";
    else if (path.includes("training-planner")) key = "training-planner";
    else if (path.includes("forms-manage")) key = "forms-manage";
    else if (path.includes("reports")) key = "reports";
    else if (path.includes("live-forms")) key = "live-forms";

    const content = helpContent[key] || helpContent["default"];

    // 2. Inject HTML
    const helpHtml = `
        <button id="globalHelpBtn" title="Get Help">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        </button>

        <div id="globalHelpModal" class="help-modal-overlay">
            <div class="help-modal-content">
                <span class="help-close-btn">&times;</span>
                <h2 style="margin-top:0;">${content.title}</h2>
                <div class="help-body">${content.body}</div>
            </div>
        </div>
    `;

    // Append to body
    const div = document.createElement('div');
    div.innerHTML = helpHtml;
    document.body.appendChild(div);

    // 3. Logic
    const btn = document.getElementById('globalHelpBtn');
    const modal = document.getElementById('globalHelpModal');
    const close = document.querySelector('.help-close-btn');

    // Adjust position if on Dashboard 
    if (key === "index") {
        // OLD: btn.style.top = "80px";
        // NEW:
        btn.style.top = "20px"; // Consistent with other pages
        btn.style.right = "20px";
    } else {
        btn.style.top = "20px";
        btn.style.right = "20px";
    }
    btn.addEventListener('click', () => {
        modal.classList.add('show');
    });

    close.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

})();