/**
 * CENTRALIZED HELP CONFIGURATION
 * Detailed guide for OpReady
 */
const helpContent = {
    // --- Dashboard ---
    "index": {
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
        `
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
        `
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
        `
    },

    // --- Surveys Manager (Building) ---
    "surveys-manage": {
        title: "Surveys Manager: Builder & Publishing",
        body: `
            <p>Create and distribute <strong>Anonymous Surveys</strong> for feedback, elections, or general polling.</p>
            
            <h3>1. Building the Survey</h3>
            <ul>
                <li><strong>Anonymous by Design:</strong> Unlike Live Forms, surveys do not calculate scores and do not link the member's identity to their answers.</li>
                <li><strong>Question Types:</strong> Add Multiple Choice, Checkboxes, Yes/No, or Free Text questions. Use the dropdown to choose display styles (Radio buttons vs Dropdown menus).</li>
                <li><strong>Sorting:</strong> Click the sort icon to toggle between Alphabetical, Active first, or Disabled first.</li>
            </ul>

            <h3>2. Publishing</h3>
            <ul>
                <li>Click <strong>Publish</strong> to distribute the survey.</li>
                <li>You can select specific members or send to all active members.</li>
                <li>Publishing generates a unique tracking link for each member and emails them an invitation (configured in <em>Templates</em>).</li>
            </ul>
        `
    },

    // --- Live Surveys ---
    "live-surveys": {
        title: "Live Surveys: Monitoring & Archiving",
        body: `
            <p>Monitor the status of your published surveys.</p>
            
            <h3>1. Tracking Progress</h3>
            <ul>
                <li><strong>Progress Bar:</strong> Shows the ratio of members who have submitted the survey versus how many invitations were sent.</li>
                <li><strong>Results:</strong> Click to view the aggregated, anonymous answers.</li>
                <li><strong>Tracking:</strong> Click to see who has (or hasn't) completed the survey so you can send reminders.</li>
            </ul>

            <h3>2. Management</h3>
            <ul>
                <li><strong>Archive:</strong> Moves the survey to the Archived tab so it doesn't clutter your active list. Archiving also blocks any further submissions from members.</li>
                <li><strong>Delete:</strong> Permanently destroys the survey instance, all tracking codes, and all submitted answers.</li>
            </ul>
        `
    },

    // --- Surveys Tracking ---
    "surveys-tracking": {
        title: "Survey Tracking: Reminders",
        body: `
            <p>Track which members have completed the survey without compromising their anonymity.</p>
            
            <h3>1. Status & Anonymity</h3>
            <ul>
                <li><strong>Pending / Submitted:</strong> The system tracks <em>if</em> a unique link was used, but it never links the tracking code to the actual answers in the database.</li>
            </ul>

            <h3>2. Sending Reminders</h3>
            <ul>
                <li><strong>Single Reminder:</strong> Click the mail icon next to a pending member to resend their unique link.</li>
                <li><strong>Remind All:</strong> Use the bulk action button to send reminders to everyone who is still "Pending".</li>
                <li><strong>Copy Link:</strong> Manually copy a member's unique link to send it via a different channel.</li>
            </ul>
        `
    },

    // --- Surveys Results ---
    "surveys-results": {
        title: "Survey Results: Analytics",
        body: `
            <p>View the aggregated, anonymous data from your survey.</p>
            <ul>
                <li><strong>Charts:</strong> Multiple choice and Yes/No questions are automatically tallied and displayed as percentage bar charts.</li>
                <li><strong>Free Text:</strong> Paragraph answers are listed anonymously one after another.</li>
                <li><strong>Participation:</strong> The top counter shows how many people submitted answers out of the total invited.</li>
            </ul>
        `
    },

    // --- Skills Management ---
    "skills": {
        title: "Manage Skills Configuration",
        body: `
            <p>Map the skill names from the FENZ Dashboard to your verification methods.</p>
            
            <h3>1. Import & Sync</h3>
            <p>Click <strong>Import from OSM</strong> to scan the dashboard. The dialog shows <strong>New</strong> skills not yet configured and <strong>Changed</strong> skills whose category has been updated. Select any combination and click <strong>Apply Selected</strong>. Critical skills (marked <code>(C)</code>) are flagged automatically.</p>

            <h3>2. Linking Forms</h3>
            <p>Each skill can be linked to a verification method:</p>
            <ul>
                <li><strong>External URL:</strong> A link to Google Forms, SurveyMonkey, etc. Use <code>{{member-name}}</code> and <code>{{member-email}}</code> placeholders to pre-fill data.</li>
                <li><strong>App Hosted Form:</strong> Select a form created in the <em>Forms Manager</em>. This enables the full tracking, scoring, and review lifecycle.</li>
            </ul>

            <h3>3. Visibility</h3>
            <p>Use the <strong>Enabled</strong> toggle to hide skills you don't want to track (e.g., administrative items) without deleting them from the database.</p>
        `
    },

    // --- Members ---
    "members": {
        title: "Member Management",
        body: `
            <p>Manage your brigade roster and their communication preferences.</p>
            <ul>
                <li><strong>Import from OSM:</strong> Scans the live dashboard and shows two lists — <strong>New</strong> members not yet in your roster, and <strong>Changed</strong> members whose rank or name data differs. Select any combination and click <strong>Apply Selected</strong> to add or update them.</li>
                <li><strong>Notification Preferences:</strong> For each member, you can define if they should receive <strong>Email</strong>, <strong>WhatsApp</strong>, or both by default. This controls the pre-selected checkboxes on the main Dashboard.</li>
                <li><strong>Enabled Status:</strong> Disabled members are hidden from the dashboard and reports, preserving their data history without cluttering the view.</li>
            </ul>
        `
    },

    // --- Templates ---
    "templates": {
        title: "Communication Templates",
        body: `
            <p>Customize the messages sent by the system. Templates support <strong>Rich Text</strong> (Email) and <strong>Markdown</strong> (WhatsApp).</p>
            
            <h3>Template Types</h3>
            <ul>
                <li><strong>Expiring Skills:</strong> The primary notification listing all due competencies.</li>
                <li><strong>Form Accepted:</strong> Sent when a Live Form submission is approved.</li>
                <li><strong>Form Rejected:</strong> Sent when a submission fails. Includes logic for "Retry Links" if a new attempt was generated.</li>
                <li><strong>Survey Invitations:</strong> Sent when an anonymous survey is published or a reminder is triggered.</li>
                <li><strong>System:</strong> New User credentials, Password Reset, etc.</li>
            </ul>

            <h3>Dynamic Variables</h3>
            <p>Drag and drop chips from the palette into the editor. Key variables include:</p>
            <ul>
                <li><code>{{custom_comment}}</code>: Inserts the specific feedback you wrote during the review process.</li>
                <li><code>{{url}}</code>: In rejection templates, this inserts the <strong>new</strong> link for the retry attempt.</li>
                <li><code>{{surveyLink}}</code>: In survey templates, this inserts the unique, anonymous access URL.</li>
            </ul>
        `
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
        `
    },

    // --- Statistics ---
    "statistics": {
        title: "Brigade Statistics",
        body: `
            <p>High-level visual analytics of your brigade's operational readiness.</p>
            <ul>
                <li><strong>Member Compliance:</strong> A doughnut chart showing the percentage of members who are fully compliant vs. those with at least one expiring skill.</li>
                <li><strong>Skill Priority:</strong> A breakdown of expiring skills by "Critical" status to help prioritize training.</li>
                <li><strong>Export PDF:</strong> Generates a report containing snapshots of these charts for management meetings.</li>
            </ul>
        `
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
        `
    },

    // --- Backup & Restore ---
    "backup-restore": {
        title: "Backup &amp; Restore",
        body: `
            <h3>1. Backup</h3>
            <p>Two backup types are available:</p>
            <ul>
                <li><strong>Full Backup</strong> — downloads a <code>.zip</code> file containing the complete database <em>and</em> all uploaded Knowledge Base documents (local storage only). Use this for a complete disaster-recovery snapshot.</li>
                <li><strong>Database Only</strong> — downloads a <code>.sql</code> file containing the database alone. Use this when Knowledge Base documents are stored in S3 or GCS (managed separately by the cloud provider).</li>
            </ul>

            <h3>2. Restore</h3>
            <p>Upload a backup file to restore the system. <strong style="color:red;">Warning:</strong> This completely overwrites the current data and cannot be undone.</p>
            <ul>
                <li>Upload a <code>.zip</code> (Full Backup) to restore both the database and local Knowledge Base documents.</li>
                <li>Upload a <code>.sql</code> (Database Only) to restore the database only.</li>
            </ul>
            <p>The backup must have been created by the same or an earlier version of OpReady. All active sessions are cleared after restore — everyone must log in again.</p>

            <h3>3. Scheduled Backup</h3>
            <p>Automatically create and save backup files on a repeating schedule. Set the frequency, backup type, save location, and retention policy.</p>
            <ul>
                <li><strong>Frequency options:</strong> Once a day, selected days of the week, every N hours, or every N days.</li>
                <li><strong>Save location:</strong> An absolute path on the server (e.g. <code>/app/backups</code>). Mounted network shares work if accessible from the Node.js process. The directory is created automatically.</li>
                <li><strong>Retention:</strong> Keep the last N files, delete files older than N days, or keep everything.</li>
                <li><strong>Run Now:</strong> Trigger a backup immediately using the saved configuration without waiting for the next scheduled time.</li>
            </ul>
            <p><strong style="color:var(--warning, #e07b00);">&#9888; Ephemeral deployments:</strong> Scheduled backups require a persistently running server. They are automatically disabled on Cloud Run, App Runner, and Fargate. Use an external scheduler (Cloud Scheduler, EventBridge, or a cron job on a persistent machine) calling <code>GET /api/system/backup</code> with an API key instead.</p>

            <h3>4. Remote Servers</h3>
            <p>Pull and schedule backups from other OpReady server instances — useful for centralised backup storage.</p>
            <ul>
                <li><strong>Add server:</strong> Provide a name, the remote base URL, and a superadmin API key from that instance. The API key is stored securely and never re-displayed. Use <strong>Test Connection</strong> to verify reachability before saving — note that ephemeral servers (Cloud Run, etc.) may take up to 90 seconds to respond on a cold start.</li>
                <li><strong>Download Backup (manual):</strong> Click the Play (▶) button to immediately fetch a backup from the remote server. The file is delivered directly to your browser via the standard Save As dialog — nothing is written to the server filesystem.</li>
                <li><strong>Scheduled pull:</strong> Click the Clock (🕐) button to configure an automatic pull schedule. The schedule modal lets you set frequency, backup type, <strong>save location</strong> (the local path where pulled files are stored), and retention policy. A <strong>Run Now</strong> button inside the modal lets you test the configuration immediately — the file is saved to the configured location, exactly as the scheduler would do it.</li>
                <li><strong>Save location:</strong> Configured per-server in the Schedule modal (not in the server connection settings). Defaults to <code>/app/backups/remote/&lt;server-name&gt;/</code> if left blank. Mount <code>/app/backups</code> as a Docker volume so pulled files survive container recreation.</li>
                <li><strong>History:</strong> Click the List icon to view the last 20 pull runs — date, type, triggered by (manual or scheduler), filename, size, and status.</li>
                <li>Maximum of <strong>5</strong> remote servers. No restore operations — pull backups are for disaster-recovery storage only.</li>
            </ul>
        `
    },

    // --- System Tools ---
    "system-tools": {
        title: "System Tools",
        body: `
            <h3>1. Backup &amp; Restore</h3>
            <p>Download backups or restore the system from a saved backup file. These operations are available on the dedicated <strong>Backup &amp; Restore</strong> page, accessible from the navigation menu or the link on this page.</p>

            <h3>2. Knowledge Base</h3>
            <p>Two maintenance tools are available for the Knowledge Base document library.</p>
            <ul>
                <li><strong>Rotate Document Links</strong> — assigns a new GUID to every document, immediately invalidating all previously shared public links. Use periodically or when a link may have been shared with unintended recipients. Documents are not affected — only their access URLs change. Links embedded in forms and surveys update automatically (stored as document IDs, not raw URLs).</li>
                <li><strong>Find Documents with Missing Files</strong> — scans every document record and checks whether its physical file is present in the storage backend. Useful after a database-only restore, a storage migration, or if files were deleted outside the application. The scan is read-only and covers all documents regardless of active/inactive status.</li>
            </ul>

            <h3>3. API Key Management</h3>
            <p>Create and manage API keys that allow external systems to authenticate to the REST API without a browser session.</p>
            <ul>
                <li><strong>Create:</strong> Give the key a name and assign a role — <em>superadmin</em> (full access including user &amp; key management), <em>admin</em> (full read/write), <em>simple</em> (read-only statistics/reports), or <em>guest</em> (read-only public data). The full key is shown <strong>once</strong> — copy it immediately as it cannot be retrieved again.</li>
                <li><strong>Revoke / Enable:</strong> Toggle a key inactive without deleting it. A revoked key is rejected immediately on all API requests.</li>
                <li><strong>Delete:</strong> Permanently removes the key from the database.</li>
            </ul>
            <p>External systems authenticate by adding the header <code>X-API-Key: osm_…</code> to any <code>/api/*</code> request. See the interactive API reference at <code>/api/docs</code> for the full endpoint list.</p>

            <h3>4. AI Evaluator Test Lab</h3>
            <p>An ad-hoc sandbox for testing the AI grading logic against custom question/answer pairs before enabling it for live forms. Settings auto-save to your user profile.</p>

            <h3>5. Install as App (PWA)</h3>
            <p>OpReady is a <strong>Progressive Web App</strong>. When supported by your browser, an <em>Install OpReady</em> banner will appear at the top of the page. Installing adds OpReady to your device's home screen or taskbar for one-tap access, works offline for recently visited pages, and removes browser chrome for a native app feel.</p>
            <ul>
                <li>The install banner appears automatically when the browser detects the app is installable. Dismiss it and it won't reappear until the next session.</li>
                <li>On iOS (Safari): use the Share button → <strong>Add to Home Screen</strong>.</li>
                <li>On Android (Chrome) or desktop (Chrome/Edge): accept the Install banner or use the browser menu → <strong>Install OpReady</strong>.</li>
            </ul>
        `
    },

    // --- User Management ---
    "users": {
        title: "User Roles & Security",
        body: `
            <p>Manage access to {{appname}}.</p>
            <h3>Roles</h3>
            <ul>
                <li><strong>Guest:</strong> Read-only access.</li>
                <li><strong>Simple:</strong> Can view dashboard and send notifications. Restricted from configuration pages.</li>
                <li><strong>Admin:</strong> Full access to manage Members, Skills, Forms, and Users.</li>
                <li><strong>Super Admin:</strong> (Environment User) Has access to everything, including Database Restore and Log Purging.</li>
            </ul>
            <h3>Security</h3>
            <p>Users are automatically <strong>Blocked</strong> after a configurable number of failed login attempts (set via <code>MAX_LOGIN_ATTEMPTS</code> in the environment configuration, default 5). An admin must manually uncheck "Blocked" in the Edit User modal to restore access.</p>
        `
    },

    // --- Third Party Services ---
    "third-parties": {
        title: "WhatsApp Integration",
        body: `
            <p>Connects the server to a real WhatsApp account to send skill expiry notifications directly to members' phones.</p>

            <h3>1. Setup</h3>
            <ol>
                <li>Click <strong>Start Service</strong> to launch the headless browser.</li>
                <li>Wait for a <strong>QR Code</strong> to appear, then scan it using <em>Linked Devices</em> in your mobile WhatsApp app.</li>
                <li>Once connected, the status indicator turns <strong>Green (Ready)</strong> and shows your account name and number.</li>
            </ol>

            <h3>2. Connection Status</h3>
            <ul>
                <li><strong style="color:#6c757d;">Disconnected:</strong> Service is stopped. Click <em>Start Service</em> to begin.</li>
                <li><strong style="color:#fd7e14;">Initializing / QR Ready:</strong> Browser is starting up or waiting for QR scan.</li>
                <li><strong style="color:#fd7e14;">Reconnecting:</strong> Connection was lost unexpectedly. The service is automatically retrying (5 s → 15 s → 60 s → 5 min intervals). No action needed.</li>
                <li><strong style="color:#28a745;">Ready:</strong> Connected and able to send messages.</li>
            </ul>

            <h3>3. Automatic Resilience</h3>
            <ul>
                <li><strong>Auto-Reconnect:</strong> If the connection drops, the service retries automatically using an exponential backoff schedule. You do not need to click <em>Start Service</em> again unless the status stays stuck for an extended period.</li>
                <li><strong>Message Queue:</strong> Notifications triggered while disconnected are held in a server-side queue and delivered automatically once the connection is restored — up to 3 retry attempts per message.</li>
            </ul>

            <h3>4. Preferences</h3>
            <p><strong>Auto-disconnect:</strong> If enabled, logging out of the web app will automatically destroy the WhatsApp session. Recommended for shared computers — you will need to re-scan the QR code on the next login.</p>
        `
    },

    // --- Reports ---
    "reports": {
        title: "Reporting Console",
        body: `
            <p>Generate, print, and export compliance and verification reports. All reports respect your configured timezone and date format.</p>

            <h3>Competency Reports</h3>
            <ul>
                <li><strong>By Member:</strong> All expiring skills grouped per person. Useful for individual follow-up conversations.</li>
                <li><strong>By Skill:</strong> All affected members grouped per competency. Useful for planning training blocks.</li>
                <li><strong>Planned Sessions:</strong> A timeline of future in-person training sessions scheduled in the Training Planner.</li>
                <li><strong>Critical Overdue:</strong> Members with expired or imminently expiring <em>Critical</em> skills — the highest-priority action list.</li>
                <li><strong>Compliance Matrix:</strong> A full member × skill grid showing compliance status at a glance.</li>
                <li><strong>Verification History:</strong> A chronological record of completed Live Form submissions and outcomes.</li>
                <li><strong>Training Attendance:</strong> Attendance records for past in-person training sessions.</li>
            </ul>

            <h3>Survey Reports</h3>
            <ul>
                <li><strong>Survey Participation Overview:</strong> All published survey campaigns with sent/responded counts and response rate percentage.</li>
                <li><strong>Survey Response Log:</strong> A chronological log of individual survey submissions for a configurable lookback period. Anonymous survey respondents are shown as <em>Anonymous</em>.</li>
            </ul>

            <h3>Export Options</h3>
            <ul>
                <li><strong>Print:</strong> Opens the browser print dialog with an A4-optimised layout.</li>
                <li><strong>Export PDF:</strong> Generates and downloads a PDF directly without opening the print dialog.</li>
            </ul>
        `
    },
    
    // --- Dynamic Form Views ---
    "forms-view-live": {
        title: "Member Verification - Live Mode",
        body: `
            <p><strong>Member Action Required:</strong> You are accessing a secure verification form linked to your OSM competency record.</p>
            <ul>
                <li><strong>Tracking:</strong> Your progress and submission are tracked. Ensure the name displayed matches your own.</li>
                <li><strong>Required Fields:</strong> Questions marked with a red asterisk (*) must be answered to submit.</li>
                <li><strong>Attempts:</strong> Note the 'Max Attempts' allowed. If you fail to meet the passing threshold, the attempt is logged, and you may be prompted to try again immediately.</li>
            </ul>
        `
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
        `
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
        `
    },

    // --- Dynamic Survey Views ---
    "surveys-view-live": {
        title: "Anonymous Survey - Live Mode",
        body: `
            <p><strong>Member Action Required:</strong> You are accessing a secure survey.</p>
            <ul>
                <li><strong>Anonymity Guarantee:</strong> Your responses are completely anonymous. Your tracking code is used only to mark that you have completed the survey and is immediately discarded before your answers are saved.</li>
                <li><strong>Required Fields:</strong> Questions marked with "(required)" must be answered to submit.</li>
            </ul>
        `
    },
    "surveys-view-preview": {
        title: "Survey Preview Mode",
        body: `
            <p><strong>Admin View:</strong> You are previewing the survey layout.</p>
            <ul>
                <li><strong>No Data Saved:</strong> Submitting this form will NOT record any answers.</li>
                <li><strong>Validation:</strong> Use this mode to verify your question wording, required flags, and layout before publishing to the brigade.</li>
            </ul>
        `
    },

    // --- Profile ---
    "profile": {
        title: "My Profile & Security Settings",
        body: `
            <p>Manage your own account credentials and two-factor authentication.</p>

            <h3>1. Profile Details</h3>
            <ul>
                <li><strong>Name &amp; Email:</strong> Update your display name and login email address.</li>
                <li><strong>Change Password:</strong> Enter your current password, then your new password twice to confirm. Passwords are stored using a secure one-way hash.</li>
            </ul>

            <h3>2. Two-Factor Authentication (MFA)</h3>
            <ul>
                <li><strong>Enable MFA:</strong> Click <em>Set Up MFA</em> to generate a QR code. Scan it with an authenticator app (Google Authenticator, Authy, etc.). Enter the 6-digit code to confirm and activate.</li>
                <li><strong>Disable MFA:</strong> Re-enter your current password to remove the second factor from your account.</li>
                <li>MFA is applied at login — after entering your password you will be asked for the current 6-digit code from your app.</li>
            </ul>
        `
    },

    // --- Knowledge Base ---
    "knowledgebase": {
        title: "Knowledge Base",
        body: `
            <p>The <strong>Knowledge Base</strong> lets you upload, organise, and share documents with brigade members — no login required to view them.</p>

            <h3>1. Categories</h3>
            <ul>
                <li><strong>Add:</strong> Click <em>+ Add</em> in the Categories panel to create a root or sub-category. The document count badge next to each folder reflects the current filter.</li>
                <li><strong>Select:</strong> Click any category to filter the document list on the right. Click <em>All Documents</em> to see everything.</li>
                <li><strong>Edit / Delete:</strong> Hover over a category name to reveal the edit and delete icons. On mobile, they are always visible.</li>
                <li>Deleting a category re-parents its sub-categories and leaves its documents as <em>Uncategorized</em>.</li>
            </ul>

            <h3>2. Filtering</h3>
            <ul>
                <li>Use the <strong>Filters</strong> bar to narrow the document list by title, description, or active/disabled status.</li>
                <li>Click <strong>Apply</strong> to activate the filters. The category tree document counts update to reflect the filtered set.</li>
                <li>Click <strong>Reset</strong> to clear all filters and restore the full list.</li>
            </ul>

            <h3>3. Uploading Documents</h3>
            <ul>
                <li>Click <strong>Upload Document</strong> and fill in the title, optional description, category, and expiry date.</li>
                <li>When you select a file, the <strong>Title</strong> field is automatically pre-filled from the filename — hyphens and underscores are replaced with spaces and the extension is stripped. You can edit the title before saving.</li>
                <li>Supported types: <strong>PDF, Word (.doc/.docx), Excel (.xls/.xlsx), RTF</strong> · maximum 50 MB per upload.</li>
                <li>The <strong>Expiry date</strong> defaults to today + the configured number of days (set via <code>KB_DEFAULT_EXPIRY_DAYS</code> in <code>.env</code>, default 365). Expired documents are flagged in red for admin review — they remain publicly accessible until explicitly disabled or deleted.</li>
                <li>A unique GUID link is generated automatically — share it with members so they can view or download the document without logging in.</li>
                <li>The category field pre-selects the category currently active in the left tree.</li>
            </ul>

            <h3>4. Sharing with Members</h3>
            <ul>
                <li>Click <strong>Copy Link</strong> on any document to copy the public URL to your clipboard.</li>
                <li>Click <strong>View</strong> to preview the document as members will see it. PDFs display inline; Word and Excel open via Google Docs Viewer (on public servers) or as a download on mobile/iOS.</li>
                <li>The link looks like: <code>/knowledgebase/4A04912E-...</code> — only someone who has the link can access the document.</li>
            </ul>

            <h3>5. Expiry &amp; Review</h3>
            <ul>
                <li>Documents flagged as expired show a red <strong>EXPIRED</strong> badge in the document table and a red <code>!N</code> count in the category tree.</li>
                <li>Open the <strong>Edit</strong> modal to extend the expiry date, replace the file content, or renew the public link.</li>
                <li>Expiry does <em>not</em> automatically disable a document — it is a visual reminder for admin review.</li>
            </ul>

            <h3>6. Managing Documents</h3>
            <ul>
                <li><strong>Active toggle:</strong> Disable a document to make it temporarily inaccessible without deleting it.</li>
                <li><strong>Edit:</strong> Update the title, description, category, or expiry date.</li>
                <li><strong>Replace File:</strong> Inside the Edit modal, attach a new file to overwrite the stored content. The document's ID, public link, and storage key remain unchanged — only the bytes are replaced.</li>
                <li><strong>Missing file recovery:</strong> If the Edit modal shows an amber <em>File not found in storage</em> warning (e.g. after a database-only restore), the document record is intact but the physical file is absent. Select a replacement file in the Replace File section and save to restore access.</li>
                <li><strong>Renew Link:</strong> Inside the Edit modal, click <em>Renew Link</em> to rotate this document's GUID. Its current public link stops working immediately; a new URL is generated. Use this when a link has been shared with unintended recipients.</li>
                <li><strong>Delete:</strong> Permanently removes the document and its file. The link will stop working immediately.</li>
            </ul>

            <h3>7. Embedding Links in Forms &amp; Surveys</h3>
            <ul>
                <li>When editing a form or survey, use the green <strong>KB Link</strong> button at the start of any TinyMCE toolbar to insert a link to a Knowledge Base document.</li>
                <li>The link is stored as a placeholder using the document's integer ID — not the slug — so it automatically updates if the document's public link is rotated.</li>
            </ul>

            <h3>8. Rotating Links (Security)</h3>
            <ul>
                <li><strong>Per-document:</strong> Use the <em>Renew Link</em> button in the Edit modal to rotate one document's link.</li>
                <li><strong>All documents at once:</strong> Go to <strong>System Tools → Rotate Document Links</strong> and type <code>ROTATE</code> to confirm. Every document is assigned a new GUID immediately. Links embedded in forms and surveys are <em>not</em> affected — they resolve dynamically via document ID.</li>
            </ul>
        `
    },

    // --- Default / Fallback ---
    "default": {
        title: "Help",
        body: "<p>Welcome to {{appname}}. Please navigate to a specific page to see context-aware help here.</p>"
    }
};

// --- LOGIC: Inject Button and Modal ---
(function () {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    let key = "default";

    // Standard routing
    if (path === "/" || path.endsWith("index.html")) key = "index";
    else if (path.includes("members")) key = "members";
    else if (path.includes("skills")) key = "skills";
    else if (path.includes("templates")) key = "templates";
    else if (path.includes("backup-restore")) key = "backup-restore";
    else if (path.includes("system-tools")) key = "system-tools";
    else if (path.includes("event-log")) key = "event-log";
    else if (path.includes("users")) key = "users";
    else if (path.includes("profile")) key = "profile";
    else if (path.includes("third-parties")) key = "third-parties";
    else if (path.includes("training-planner")) key = "training-planner";
    else if (path.includes("forms-manage")) key = "forms-manage";
    else if (path.includes("reports")) key = "reports";
    else if (path.includes("live-forms")) key = "live-forms";
    else if (path.includes("statistics")) key = "statistics";
    else if (path.includes("surveys-manage")) key = "surveys-manage";
    else if (path.includes("live-surveys")) key = "live-surveys";
    else if (path.includes("surveys-tracking")) key = "surveys-tracking";
    else if (path.includes("surveys-results")) key = "surveys-results";
    else if (path.includes("knowledgebase")) key = "knowledgebase";

    // DYNAMIC FORMS-VIEW LOGIC
    if (path.includes("forms-view")) {
        if (params.has('reviewId')) {
            key = "forms-view-review";
        } else if (params.get('preview') === 'true') {
            key = "forms-view-preview";
        } else if (params.has('code')) {
            key = "forms-view-live";
        }
    }

    // DYNAMIC SURVEYS-VIEW LOGIC
    if (path.includes("surveys-view")) {
        if (params.get('preview') === 'true') {
            key = "surveys-view-preview";
        } else if (params.has('code')) {
            key = "surveys-view-live";
        }
    }

    const content = helpContent[key] || helpContent["default"];

    // Force inline styles to guarantee visibility and position
    const helpHtml = `
        <button id="globalHelpBtn" title="Get Help" 
                style="position: fixed; top: 7px; right: 20px; z-index: 9999;
                       width: 45px; height: 45px; border-radius: 50%;
                       background-color: #17a2b8; color: white; border: none; 
                       cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); 
                       display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        </button>

        <div id="globalHelpModal" class="help-modal-overlay">
            <div class="help-modal-content">
                <button class="help-close-btn" title="Close help">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <h2 style="margin-top:0; padding-right:32px; border-bottom:1px solid var(--border-color); padding-bottom:10px; color:var(--primary);">${content.title}</h2>
                <div class="help-body">${content.body}</div>
                <div class="help-modal-footer">
                    <button class="btn-secondary help-close-footer-btn" title="Close help">Close</button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = helpHtml;
    document.body.appendChild(div);

    const btn = document.getElementById('globalHelpBtn');
    
    // Shift button down ONLY in Review Mode to clear the black administration bar
    if (key === "forms-view-review") {
        btn.style.top = "75px";
    }

    const modal = document.getElementById('globalHelpModal');
    const closeModal = () => modal.classList.remove('show');

    btn.addEventListener('click', () => modal.classList.add('show'));
    document.querySelectorAll('.help-close-btn, .help-close-footer-btn').forEach(el => {
        el.addEventListener('click', closeModal);
    });
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
    });

    // Patch {{appname}} placeholder with the configured app title
    fetch('/ui-config').then(r => r.json()).then(cfg => {
        const appName = cfg.loginTitle || 'OpReady';
        const body = document.querySelector('#globalHelpModal .help-body');
        if (body) body.innerHTML = body.innerHTML.replace(/\{\{appname\}\}/g, appName);
    }).catch(() => {});

    // --- MOBILE TOP BANNER ---
    // Pages that get the Android-style top navigation banner
    const bannerKeys = [
        'index', 'members', 'skills', 'templates', 'system-tools', 'backup-restore',
        'event-log', 'users', 'profile', 'third-parties', 'training-planner',
        'forms-manage', 'reports', 'live-forms', 'statistics', 'surveys-manage',
        'live-surveys', 'surveys-tracking', 'surveys-results',
        'forms-view-review', 'forms-view-preview', 'surveys-view-preview',
        'knowledgebase'
    ];

    // Short display titles for the banner (no app-name suffix)
    const bannerTitles = {
        'index': 'Dashboard',
        'members': 'Members',
        'skills': 'Skills',
        'templates': 'Templates',
        'system-tools': 'System Tools',
        'backup-restore': 'Backup & Restore',
        'event-log': 'Event Log',
        'users': 'Users',
        'profile': 'My Profile',
        'third-parties': 'Third Party Services',
        'training-planner': 'Training Planner',
        'forms-manage': 'Forms Manager',
        'reports': 'Reports',
        'live-forms': 'Live Forms',
        'statistics': 'Statistics',
        'surveys-manage': 'Surveys Manager',
        'live-surveys': 'Published Surveys',
        'surveys-tracking': 'Survey Tracking',
        'surveys-results': 'Survey Results',
        'forms-view-review': 'Form Review',
        'forms-view-preview': 'Form Preview',
        'surveys-view-preview': 'Survey Preview',
        'knowledgebase': 'Knowledge Base'
    };

    if (bannerKeys.indexOf(key) !== -1) {
        document.body.classList.add('has-mobile-banner');
        if (key === 'index') document.body.classList.add('is-home-page');

        const bannerLabel = bannerTitles[key] || content.title;
        const noBack = (key === 'index');
        const backUrls = {
            'surveys-results':  '/live-surveys.html',
            'surveys-tracking': '/live-surveys.html'
        };
        const backUrl = backUrls[key] || '/';
        const backTitle = backUrl === '/' ? 'Back to Dashboard' : 'Back to Live Surveys';

        const bannerEl = document.createElement('div');
        bannerEl.id = 'mobilePageBanner';
        bannerEl.innerHTML = `
            ${noBack ? '' : `<a href="${backUrl}" id="mobileBannerBack" title="${backTitle}"
               style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;text-decoration:none;border-radius:50%;flex-shrink:0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                     fill="none" stroke="#ffffff" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </a>`}
            <span id="mobileBannerTitle">${bannerLabel}</span>
            <button id="mobileBannerHelp" title="Get Help">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </button>
        `;
        document.body.insertBefore(bannerEl, document.body.firstChild);

        document.getElementById('mobileBannerHelp').addEventListener('click', () => {
            modal.classList.add('show');
        });
    }
})();