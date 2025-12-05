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
                <li><strong>Send Emails:</strong> Sends reminders to selected members. Only available if checkboxes are selected.</li>
                <li><strong>Filters:</strong> Use the toggle buttons at the top right of the table:
                    <ul>
                        <li><strong>Hide Empty:</strong> Hides members who have no expiring skills listed.</li>
                        <li><strong>Has Form Only:</strong> Hides skills that do not have a configured Google Form URL.</li>
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
            <p><strong>Add Member:</strong> Manually add a single member. Name must match OSM exactly.</p>
            <p><strong>Import CSV:</strong> Bulk upload members. <br>Format: <code>name, email, mobile, enabled</code>.</p>
            <p><strong>Edit/Delete:</strong> Use the pencil or trash icons to modify specific members.</p>
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
            <p><strong>Form URL:</strong> Paste the Google Form link here.</p>
            <p><strong>URL Templating:</strong> You can pre-fill form fields using variables:</p>
            <ul>
                <li><code>{{member-name}}</code> - Inserts the member's name.</li>
                <li><code>{{member-email}}</code> - Inserts the member's email.</li>
            </ul>
            <p><em>Example:</em> <code>https://docs.google.com/forms/d/e/...?entry.123={{member-name}}</code></p>
        `
    },
    // --- Email Templates ---
    "email-templates": {
        title: "Email Templates Help",
        body: `
            <p><strong>Overview:</strong> Customize the automated emails sent by the system.</p>
            <p><strong>Tabs:</strong> Use the tabs at the top to switch between different email types.</p>
            
            <h3>Expiring Skills Template</h3>
            <ul>
                <li><strong>Filter:</strong> Check <em>"Include only skills with Form URL"</em> to completely exclude any skill that doesn't have a link configured.</li>
                <li><strong>Dual Row Templates:</strong>
                    <ul>
                        <li><strong>Row (With URL):</strong> Used for skills that have a valid Form URL.</li>
                        <li><strong>Row (No URL):</strong> Used for skills without a link (unless filtered out).</li>
                    </ul>
                </li>
            </ul>

            <h3>General Editing</h3>
            <p><strong>Drag & Drop Variables:</strong> Drag the gray chips (e.g., <code>{{name}}</code>) into the Subject or Body editor to insert dynamic placeholders.</p>
            <ul>
                <li><strong>Import/Export:</strong> Use the buttons in the top-right of each tab to backup or restore specific templates.</li>
                <li><strong>Form URL (Skills):</strong> To link the "Form URL" correctly:
                    <ol>
                        <li>Type text like "Click here".</li>
                        <li>Highlight it and click the Link icon in the editor toolbar.</li>
                        <li>Paste <code>{{url}}</code> into the URL field.</li>
                    </ol>
                </li>
            </ul>
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
    "third-parties": {
        title: "Third Party Services Help",
        body: `
            <p><strong>WhatsApp Integration:</strong></p>
            <p>This allows the system to send notifications directly to member's mobile phones.</p>
            <ol>
                <li>Click <strong>Start Service</strong> to launch the client.</li>
                <li>Wait for the <strong>QR Code</strong> to appear.</li>
                <li>Open WhatsApp on your phone, go to <strong>Linked Devices</strong>, and scan the code.</li>
                <li>Once connected, the status will turn Green.</li>
            </ol>
            <p><strong>Note:</strong> You must keep the phone connected to the internet. If the server restarts, the session is usually restored automatically, but you may need to verify connection here.</p>
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
    else if (path.includes("email-templates")) key = "email-templates";
    else if (path.includes("system-tools")) key = "system-tools";
    else if (path.includes("event-log")) key = "event-log";
    else if (path.includes("users")) key = "users";
    else if (path.includes("profile")) key = "profile";
    else if (path.includes("login")) key = "login";
    else if (path.includes("third-parties")) key = "third-parties";
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

    // Adjust position if on Dashboard to avoid Menu overlap
    if (key === "index") {
        btn.style.top = "80px";
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