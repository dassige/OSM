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
                <li><strong>Filters:</strong> Use the checkboxes on the right to hide members with no issues or skills without online forms.</li>
            </ul>
            <p><em>Note:</em> Skills in <strong>bold</strong> are Critical. The <span style="color:#007bff">📄</span> icon indicates a direct link to the Google Form is available.</p>
        `
    },
    // --- Member Management ---
    "members": {
        title: "Manage Members Help",
        body: `
            <p><strong>Add Member:</strong> Manually add a single member. Name must match OSM exactly.</p>
            <p><strong>Import CSV:</strong> Bulk upload members. <br>Format: <code>name, email, mobile</code>.</p>
            <p><strong>Edit/Delete:</strong> Use the pencil or trash icons to modify specific members.</p>
            <p><strong>Export CSV:</strong> Download the current list of members for backup or editing.</p>
        `
    },
    // --- Skill Management ---
    "skills": {
        title: "Manage Skills Help",
        body: `
            <p><strong>Add Skill:</strong> Define a new skill to track. The name must match the OSM Dashboard exactly.</p>
            <p><strong>Critical Skill:</strong> Mark high-priority skills (e.g., BA). These appear bold on the dashboard.</p>
            <p><strong>Form URL:</strong> Paste the Google Form link here. It will be included in the email so members can renew immediately.</p>
        `
    },
    // --- Email Templates ---
    "email-templates": {
        title: "Email Templates Help",
        body: `
            <p><strong>Editor:</strong> Customize the email sent to members.</p>
            <p><strong>Drag & Drop:</strong> Drag the gray chips (e.g., <code>{{skill}}</code>) into the editor to place dynamic placeholders.</p>
            <p><strong>Form URL:</strong> To link the "Form URL" correctly:
            <ol>
                <li>Type text like "Click here".</li>
                <li>Highlight it and click the Link icon.</li>
                <li>Paste <code>{{url}}</code> into the URL field.</li>
            </ol>
            </p>
        `
    },
    // --- System Tools ---
    "system-tools": {
        title: "System Tools Help",
        body: `
            <p><strong>Backup:</strong> Downloads the entire <code>fenz.db</code> database file. Keep this safe.</p>
            <p><strong>Restore:</strong> Upload a <code>.db</code> file to overwrite the current system. <br><strong style="color:red">Warning:</strong> This cannot be undone.</p>
        `
    },
    // --- Event Log ---
    "event-log": {
        title: "Event Log Help",
        body: `
            <p><strong>Audit Trail:</strong> View a history of system actions (emails sent, members added, backups created, etc.).</p>
            <ul>
                <li><strong>Filtering:</strong> Use the controls at the top to filter by <strong>Event Type</strong> (e.g., Emails, System), specific <strong>Users</strong>, or a <strong>Date Range</strong>.</li>
                <li><strong>Pagination:</strong> Use the dropdown to change the number of rows per page (default is 50). This setting is saved to your profile.</li>
                <li><strong>Details:</strong> Click the <span style="color:#007bff">ℹ️</span> icon on any row to view the full raw data (JSON) associated with that event.</li>
            </ul>
        `
    },
    // --- User Management ---
    "users": {
        title: "User Management Help",
        body: `
            <p><strong>Super Admin:</strong> The default system admin (defined in .env) cannot be deleted.</p>
            <p><strong>Add User:</strong> Create new administrators who can access this console.</p>
            <p><strong>Reset Password:</strong> You can forcefully reset any user's password here.</p>
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
        `
    },
    // --- Default ---
    "default": {
        title: "Help",
        body: "<p>No specific help content is available for this page.</p>"
    }
};

// --- LOGIC: Inject Button and Modal ---

(function() {
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