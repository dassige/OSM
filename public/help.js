/**
 * CENTRALIZED HELP CONFIGURATION
 * Detailed guide for FENZ OSM Manager
 */
const helpContent = {
  // --- Dashboard ---
  index: {
    title: "Dashboard Overview & Workflow",
    body: `
            <p>The <strong>Dashboard</strong> is your command center for monitoring brigade readiness. It aggregates data from the OSM website and your local database to highlight expiring competencies.</p>
            
            <h3>1. Data Synchronization</h3>
            <ul>
                <li><strong>Reload Data:</strong> Connects to the OSM Dashboard to fetch the latest expiry dates. By default, data is cached for <strong>60 minutes</strong> to improve speed. Clicking this button forces a live refresh.</li>
                <li><strong>Days to Expiry:</strong> A look-ahead filter. Only skills expiring within this number of days (e.g., 30, 60, 90) will appear in the list.</li>
            </ul>

            <h3>2. Understanding the List</h3>
            <ul>
                <li><span style="color:#dc3545; font-weight:bold;">Red Date:</span> The skill has already expired.</li>
                <li><strong>Bold Skill Name:</strong> Marked as 'Critical' in <em>Manage Skills</em>.</li>
                <li><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" style="color: #007bff; vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg> <strong>Blue Document:</strong> An online form (Internal or External) is linked to this skill.</li>
            </ul>

            <h3>3. Live Form Status Icons</h3>
            <p>If a skill is linked to an internal <strong>Live Form</strong>, you will see its real-time status:</p>
            <ul style="list-style: none; padding-left: 10px;">
                <li style="margin-bottom: 6px;"><span class="status-circle sent" style="width:18px; height:18px; font-size:10px;">✈</span> <strong>Sent:</strong> A unique link has been generated and emailed to the member. They have not yet submitted it.</li>
                <li style="margin-bottom: 6px;"><span class="status-circle submitted" style="width:18px; height:18px; font-size:10px;">👁</span> <strong>Submitted:</strong> The member has completed the form. It requires <strong>Admin Review</strong> in the <em>Live Forms</em> page.</li>
                <li style="margin-bottom: 6px;"><span class="status-circle accepted" style="width:18px; height:18px; font-size:10px;">✓</span> <strong>Accepted:</strong> The submission passed the score threshold or was manually approved.</li>
                <li><span class="status-circle rejected" style="width:18px; height:18px; font-size:10px;">✕</span> <strong>Rejected:</strong> The submission failed or was rejected by an admin.</li>
            </ul>

            <h3>4. Sending Notifications</h3>
            <ul>
                <li><strong>Selection:</strong> Check the <strong>Email</strong> or <strong>WhatsApp</strong> boxes for members you want to notify.</li>
                <li><strong>Defaults:</strong> Use the <strong>Reset Icon (↺)</strong> in the header to revert checkboxes to each member's saved preference (defined in <em>Manage Members</em>).</li>
                <li><strong>Send Button:</strong> Activates once at least one action is selected. It processes the queue sequentially.</li>
                <li><strong>Quick Send:</strong> Click the small circular <span style="color:#6f42c1;">✉</span> (Email) or <span style="color:#25D366;">✆</span> (WhatsApp) buttons in a row to send a single immediate reminder.</li>
            </ul>
        `,
  },

  // --- Forms Manager (Building) ---
  "forms-manage": {
    title: "Forms Manager: Builder & Scoring",
    body: `
            <p>Create internal verification questionnaires that replace external tools like Google Forms. These forms support <strong>Automatic Scoring</strong> and <strong>AI Generation</strong>.</p>
            
            <h3>1. Form Configuration</h3>
            <ul>
                <li><strong>Name:</strong> The internal title of the form.</li>
                <li><strong>Status:</strong> Use the toggle to Enable/Disable the form. Disabled forms cannot be accessed by members.</li>
            </ul>

            <h3>2. Automatic Scoring Rules</h3>
            <p>Define how the system grades submissions automatically:</p>
            <ul>
                <li><strong>Max Score Achievable:</strong> Auto-calculated sum of all question points.</li>
                <li><strong>Passing Threshold:</strong> The minimum score required to pass. Can be a <strong>Percentage (%)</strong> (e.g., 80%) or a <strong>Raw Number</strong> (e.g., 15 points).</li>
                <li><strong>Max Attempts:</strong> How many times a member can try. If they fail but have attempts left, the system automatically resets the form to "Sent" for a retry.</li>
            </ul>

            <h3>3. Building Questions</h3>
            <ul>
                <li><strong>Points:</strong> Assign a point value to every question (default is 1).</li>
                <li><strong>Correct Answer:</strong> Select the correct option(s) for auto-grading.
                    <ul>
                        <li><em>Radio/Boolean:</em> Exact match required.</li>
                        <li><em>Checkboxes:</em> Points are awarded proportionally for correct selections and deducted for incorrect ones.</li>
                        <li><em>Paragraph:</em> Requires manual review or <strong>AI Evaluation</strong>.</li>
                    </ul>
                </li>
            </ul>

            <h3>4. AI Assistance</h3>
            <p>Click the purple <strong>AI</strong> button to generate a form structure from raw text. You can copy a prompt, paste it into ChatGPT/Gemini along with your training PDF, and import the resulting JSON code.</p>
        `,
  },

  // --- Live Forms (Reviewing) ---
  "live-forms": {
    title: "Live Forms: Review & Grading",
    body: `
            <p>Monitor real-time submissions and perform quality assurance on member answers.</p>
            
            <h3>1. The Review Interface</h3>
            <p>Click the <strong>Eye Icon</strong> <span style="color:#17a2b8;">👁</span> to open a submission. The system visually grades the attempt:</p>
            <ul>
                <li><span style="background:#d4edda; border:1px solid #c3e6cb; padding:0 4px; border-radius:3px;">Green</span> <strong>Correct:</strong> Matches the answer key.</li>
                <li><span style="background:#f8d7da; border:1px solid #f5c6cb; padding:0 4px; border-radius:3px;">Red</span> <strong>Incorrect:</strong> Does not match the key.</li>
                <li><span style="background:#fff3cd; border:1px solid #ffeeba; padding:0 4px; border-radius:3px;">Yellow</span> <strong>Unanswered:</strong> The member left this field blank.</li>
            </ul>

            <h3>2. AI Evaluation</h3>
            <p>If enabled in <code>.env</code>, paragraph answers are analyzed by AI. It compares the member's text against the <strong>Reference Answer</strong> you provided in the builder and suggests a score (e.g., <em>"Score: 4/5. Reasoning: Covers main points but misses safety check."</em>).</p>

            <h3>3. Admin Actions</h3>
            <ul>
                <li><strong>Accept:</strong> Overrides any score and marks the competency as verified. Sends the "Accepted" email template.</li>
                <li><strong>Reject:</strong> Marks the attempt as failed. You can optionally:
                    <ul>
                        <li><strong>Generate New Attempt:</strong> Creates a fresh, unique link for the member immediately.</li>
                        <li><strong>Feedback:</strong> Enter a <em>Custom Comment</em> which is inserted into the rejection email.</li>
                    </ul>
                </li>
                <li><strong>Archive:</strong> Moves old or completed records to the "Archived" view to keep your main list clean.</li>
            </ul>
        `,
  },

  // --- Skills Management ---
  skills: {
    title: "Manage Skills Configuration",
    body: `
            <p>Map the skill names from the FENZ Dashboard to your verification methods.</p>
            
            <h3>1. Import & Sync</h3>
            <p>Click <strong>Import from OSM</strong> to scan the dashboard for new skill names. The system auto-detects "Critical" skills (usually marked with <code>(C)</code>) and flags them.</p>

            <h3>2. Linking Forms</h3>
            <p>Each skill can be linked to a verification method:</p>
            <ul>
                <li><strong>External URL:</strong> A link to Google Forms, SurveyMonkey, etc. Use <code>{{member-name}}</code> and <code>{{member-email}}</code> placeholders to pre-fill data.</li>
                <li><strong>App Hosted Form:</strong> Select a form created in the <em>Forms Manager</em>. This enables the full tracking, scoring, and review lifecycle.</li>
            </ul>

            <h3>3. Visibility</h3>
            <p>Use the <strong>Enabled</strong> toggle to hide skills you don't want to track (e.g., administrative items) without deleting them from the database.</p>
        `,
  },

  // --- Members ---
  members: {
    title: "Member Management",
    body: `
            <p>Manage your brigade roster and their communication preferences.</p>
            <ul>
                <li><strong>Import from OSM:</strong> Scans the live dashboard for names not yet in your database.</li>
                <li><strong>Notification Preferences:</strong> For each member, you can define if they should receive <strong>Email</strong>, <strong>WhatsApp</strong>, or both by default. This controls the pre-selected checkboxes on the main Dashboard.</li>
                <li><strong>Enabled Status:</strong> Disabled members are hidden from the dashboard and reports, preserving their data history without cluttering the view.</li>
            </ul>
        `,
  },

  // --- Templates ---
  templates: {
    title: "Communication Templates",
    body: `
            <p>Customize the messages sent by the system. Templates support <strong>Rich Text</strong> (Email) and <strong>Markdown</strong> (WhatsApp).</p>
            
            <h3>Template Types</h3>
            <ul>
                <li><strong>Expiring Skills:</strong> The primary notification listing all due competencies.</li>
                <li><strong>Form Accepted:</strong> Sent when a Live Form submission is approved.</li>
                <li><strong>Form Rejected:</strong> Sent when a submission fails. Includes logic for "Retry Links" if a new attempt was generated.</li>
                <li><strong>System:</strong> New User credentials, Password Reset, etc.</li>
            </ul>

            <h3>Dynamic Variables</h3>
            <p>Drag and drop chips from the palette into the editor. Key variables include:</p>
            <ul>
                <li><code>{{custom_comment}}</code>: Inserts the specific feedback you wrote during the review process.</li>
                <li><code>{{url}}</code>: In rejection templates, this inserts the <strong>new</strong> link for the retry attempt.</li>
            </ul>
        `,
  },

  // --- Training Planner ---
  "training-planner": {
    title: "Skills Renewal Planner",
    body: `
            <p><strong>Overview:</strong> A tool to schedule in-person training for skills that <em>don't</em> have online forms.</p>
            
            <h3>Calendar View</h3>
            <ul>
                <li><strong>Left Panel:</strong> Lists all expiring skills requiring in-person verification.</li>
                <li><strong>Drag & Drop:</strong> Drag a skill card onto a calendar day to schedule a session.</li>
                <li><strong>Training Day Filter:</strong> Toggle this to hide non-training days (e.g., show only Mondays) for a cleaner view.</li>
            </ul>

            <h3>Review List View</h3>
            <p>A chronological list of all upcoming sessions. Use the dropdown to control how many days are shown per page.</p>
        `,
  },

  // --- Statistics ---
  statistics: {
    title: "Brigade Statistics",
    body: `
            <p>High-level visual analytics of your brigade's operational readiness.</p>
            <ul>
                <li><strong>Member Compliance:</strong> A doughnut chart showing the percentage of members who are fully compliant vs. those with at least one expiring skill.</li>
                <li><strong>Skill Priority:</strong> A breakdown of expiring skills by "Critical" status to help prioritize training.</li>
                <li><strong>Export PDF:</strong> Generates a report containing snapshots of these charts for management meetings.</li>
            </ul>
        `,
  },

  // --- Event Log ---
  "event-log": {
    title: "System Audit Log",
    body: `
            <p>A comprehensive history of all actions taken within the system.</p>
            <ul>
                <li><strong>Tracks:</strong> Login attempts (success/fail), emails sent, forms submitted, settings changed, and database backups.</li>
                <li><strong>Payloads:</strong> Click the <span style="color:#17a2b8;">ℹ</span> icon to view detailed JSON data (e.g., exact scores calculated for a form submission).</li>
                <li><strong>Maintenance:</strong> Super Admins can <strong>Prune</strong> (delete old logs) or <strong>Purge</strong> (clear all logs) to save space.</li>
            </ul>
        `,
  },

  // --- System Tools ---
  "system-tools": {
    title: "Backup & Restoration",
    body: `
            <p><strong>Database Backup:</strong> Downloads a complete snapshot of the <code>fenz.db</code> SQLite file. This includes all members, skills, history, and configuration.</p>
            <p><strong>Restore:</strong> Uploads a <code>.db</code> file to replace the current system state. <strong style="color:red;">Warning:</strong> This completely overwrites the current database and cannot be undone.</p>
            <p><em>Note:</em> In <strong>Demo Mode</strong>, these operations apply only to the sandboxed <code>demo.db</code>.</p>
        `,
  },

  // --- User Management ---
  users: {
    title: "User Roles & Security",
    body: `
            <p>Manage access to the FENZ OSM Manager.</p>
            <h3>Roles</h3>
            <ul>
                <li><strong>Guest:</strong> Read-only access to the dashboard. Cannot send notifications or view logs.</li>
                <li><strong>Simple:</strong> Can view dashboard and send notifications. Restricted from configuration pages.</li>
                <li><strong>Admin:</strong> Full access to manage Members, Skills, Forms, and Users.</li>
                <li><strong>Super Admin:</strong> (Environment User) Has access to everything, including Database Restore and Log Purging.</li>
            </ul>
            <h3>Security</h3>
            <p>Users are automatically <strong>Blocked</strong> after 5 failed login attempts. An admin must manually uncheck "Blocked" in the Edit User modal to restore access.</p>
        `,
  },

  // --- Third Party Services ---
  "third-parties": {
    title: "WhatsApp Integration",
    body: `
            <p>Connects the server to a real WhatsApp account to send notifications.</p>
            <h3>Setup</h3>
            <ol>
                <li>Click <strong>Start Service</strong> to launch the headless browser.</li>
                <li>Scan the <strong>QR Code</strong> using <em>Linked Devices</em> on your mobile WhatsApp app.</li>
                <li>Once connected, the status turns <strong>Green</strong>.</li>
            </ol>
            <h3>Preferences</h3>
            <p><strong>Auto-disconnect:</strong> If enabled, logging out of the web app will automatically kill the WhatsApp session. This is recommended for shared computers.</p>
        `,
  },

  // --- Reports ---
  reports: {
    title: "Reporting Console",
    body: `
            <p>Generate printable lists of expiring competencies.</p>
            <ul>
                <li><strong>By Member:</strong> Grouped by person. Useful for individual performance reviews.</li>
                <li><strong>By Skill:</strong> Grouped by competency. Useful for planning training blocks.</li>
                <li><strong>Planned Sessions:</strong> A timeline of future training scheduled in the Planner.</li>
            </ul>
            <p>Use the <strong>Export PDF</strong> button to generate a high-quality A4 document.</p>
        `,
  },
  "forms-view-live": {
    title: "Member Verification - Live Mode",
    body: `
            <p><strong>Member Action Required:</strong> You are accessing a secure verification form linked to your OSM competency record.</p>
            <ul>
                <li><strong>Tracking:</strong> Your progress and submission are tracked. Ensure the name displayed matches your own.</li>
                <li><strong>Required Fields:</strong> Questions marked with a red asterisk (*) must be answered to submit.</li>
                <li><strong>Attempts:</strong> Note the 'Max Attempts' allowed. If you fail to meet the passing threshold, the attempt is logged, and you may be prompted to try again immediately.</li>
            </ul>
        `,
  },
  "forms-view-preview": {
    title: "Form Preview Mode",
    body: `
            <p><strong>Admin View:</strong> You are previewing the form layout and scoring logic.</p>
            <ul>
                <li><strong>No Data Saved:</strong> Submitting this form will NOT create a record or update any member skills.</li>
                <li><strong>Validation:</strong> Use this mode to verify that HTML formatting in descriptions and question point weights are correct.</li>
                <li><strong>Scoring Test:</strong> You can fill out the form to verify that the automatic pass/fail alerts behave as expected.</li>
            </ul>
        `,
  },
  "forms-view-review": {
    title: "Submission Review - Admin Mode",
    body: `
            <p><strong>Reviewing Member Results:</strong> This mode allows you to evaluate an automated submission result.</p>
            <ul>
                <li><strong>Color Coding:</strong> 
                    <span style="background:#d4edda; padding:0 4px;">Green</span> indicates a correct match; 
                    <span style="background:#f8d7da; padding:0 4px;">Red</span> indicates an error.
                </li>
                <li><strong>Reference Answers:</strong> Admins can see the 'Correct' key below member answers to facilitate manual grading of text fields.</li>
                <li><strong>Management Bar:</strong> Use the black bar at the top to <strong>Accept</strong> (verify skill), <strong>Reject</strong> (optionally generate a fresh retry link), or <strong>Archive</strong> (remove from active list).</li>
            </ul>
        `,
  },
  // --- Default / Fallback ---
  default: {
    title: "Help",
    body: "<p>Welcome to FENZ OSM Manager. Please navigate to a specific page to see context-aware help here.</p>",
  },
};

// --- LOGIC: Inject Button and Modal ---
(function () {
  const path = window.location.pathname;
  let key = "default";

  // Simple routing to map URL to Help Key
  if (path === "/" || path.endsWith("index.html")) key = "index";
  else if (path.includes("members")) key = "members";
  else if (path.includes("skills")) key = "skills";
  else if (path.includes("templates")) key = "templates";
  else if (path.includes("system-tools")) key = "system-tools";
  else if (path.includes("event-log")) key = "event-log";
  else if (path.includes("users")) key = "users";
  else if (path.includes("profile"))
    key = "profile"; // Usually self-explanatory, but good to have
  else if (path.includes("third-parties")) key = "third-parties";
  else if (path.includes("training-planner")) key = "training-planner";
  else if (path.includes("forms-manage")) key = "forms-manage";
  else if (path.includes("reports")) key = "reports";
  else if (path.includes("live-forms")) key = "live-forms";
  else if (path.includes("statistics")) key = "statistics";
  // DYNAMIC FORMS-VIEW LOGIC
  if (path.includes("forms-view")) {
    if (params.has("reviewId")) {
      key = "forms-view-review";
      setTimeout(() => {
        const btn = document.getElementById("globalHelpBtn");
        if (btn) btn.style.top = "70px";
      }, 100);
    } else if (params.get("preview") === "true") {
      key = "forms-view-preview";
    } else if (params.has("code")) {
      key = "forms-view-live";
    }
  }
  const content = helpContent[key] || helpContent["default"];

  // Inject HTML for Floating Button and Modal
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
                <h2 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px; color:var(--primary);">${content.title}</h2>
                <div class="help-body">${content.body}</div>
            </div>
        </div>
    `;

  const div = document.createElement("div");
  div.innerHTML = helpHtml;
  document.body.appendChild(div);

  const btn = document.getElementById("globalHelpBtn");
  const modal = document.getElementById("globalHelpModal");
  const close = document.querySelector(".help-close-btn");

  // Button Positioning
  btn.style.top = "20px";
  btn.style.right = "20px";
  btn.style.zIndex = "2001";

  // Event Listeners
  btn.addEventListener("click", () => {
    modal.classList.add("show");
  });
  close.addEventListener("click", () => {
    modal.classList.remove("show");
  });
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });
})();
