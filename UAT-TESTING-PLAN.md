# OpReady — UAT Testing Plan

**Application:** OpReady  
**Role under test:** Superadmin (has access to all pages and all operations)  
**Environment:** UAT (cloud-hosted or local, `APP_MODE=production`)  
**Credentials:** Superadmin account with username and password set during deployment

---

## How to Use This Document

1. Work through each section in order.
2. For every test case, follow the **Steps** column exactly.
3. Compare the actual outcome against the **Expected Result** column.
4. Mark each row **PASS** or **FAIL** in your test run tracker.
5. If a step fails, note the actual behaviour and log a defect before continuing.

### Conventions

| Symbol | Meaning |
|--------|---------|
| `[bold text]` | UI element (button, link, field) to interact with |
| `→` | Navigation step |
| ✅ | Expected success indicator on screen |
| ❌ | Expected failure/error indicator on screen |
| `{value}` | Replace with a real test value |

---

## T01 — Authentication & Login

**Page:** `login.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T01-01 | Load login page | Navigate to the application root URL. | Login form appears with Username and Password fields. No authenticated content is visible. |
| T01-02 | Login with wrong credentials | Enter `wronguser` / `wrongpass` → click `[Login]`. | Error message displayed. No redirect. |
| T01-03 | Account lock after repeated failures | Attempt login with wrong password 5+ times consecutively. | Account is blocked. A message indicates too many failed attempts. Further login is refused. |
| T01-04 | Login with valid superadmin credentials | Enter valid superadmin username and password → click `[Login]`. | Redirected to Dashboard (`index.html`). App name and navigation are visible. |
| T01-05 | Session persistence | After login, close and reopen the browser tab (same session). | User remains logged in; Dashboard loads without prompting for credentials. |
| T01-06 | Logout | Click `[Logout]` in the navigation. | Session is ended. Redirected to Login page. Navigating back to Dashboard redirects to Login. |

---

## T02 — Dashboard

**Page:** `index.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T02-01 | Page load | Log in and observe the Dashboard. | Member list renders with skill status columns. Summary statistics (totals, overdue count) are visible. |
| T02-02 | Reload OSM data | Click `[Reload Data]`. | A progress indicator appears. After completion, the table refreshes with current skill expiry data. A success toast is shown. |
| T02-03 | Filter by days-to-expiry | Use the days-to-expiry filter input and apply a value such as `30`. | Only members with at least one skill expiring within 30 days are shown. |
| T02-04 | Skill status indicators | Observe the skill columns for a member with varied statuses. | Cells show colour-coded badges: green for current, amber/orange for expiring soon, red for overdue, grey for unknown/not set. |
| T02-05 | Select members for notification | Tick checkboxes next to two or more members. | Row selection is highlighted. A notification action bar or buttons become active. |
| T02-06 | Send Email notification | With members selected, click `[Send Email]`. | A confirmation prompt appears. On confirm, emails are queued and a success toast confirms how many were sent. |
| T02-07 | Send WhatsApp notification | With members selected (those with a WhatsApp number configured), click `[Send WhatsApp]`. | Messages are queued via the WhatsApp service. A success toast confirms dispatch. If WhatsApp is not connected, a clear error is shown. |
| T02-08 | Sort table columns | Click a column header (e.g., member name). | Table rows re-sort by that column. Clicking again reverses the sort order. |
| T02-09 | Live form status badges | Observe a member who has an outstanding live form. | A badge or icon in that skill's cell indicates a form is pending review. |

---

## T03 — Members Management

**Page:** `members.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T03-01 | Page load | Navigate to `members.html`. | Member list table loads with Name, Email, Notification preferences, Enabled status columns. |
| T03-02 | Add a new member | Click `[Add Member]` → fill in Name = `{Test Member}`, Email = `{test@example.com}`, choose notification preference → click `[Save]`. | New member appears in the list. A success toast is shown. Event log records "Member Created". |
| T03-03 | Edit member name | Click `[Edit]` on a member → change Name → click `[Save]`. | Updated name appears in the list. Event log records "Member Updated". |
| T03-04 | Edit member email | Click `[Edit]` on a member → change Email → click `[Save]`. | Updated email saved. Toast confirms success. |
| T03-05 | Edit notification preference | Click `[Edit]` → change notification channel (Email / WhatsApp / Both / None) → click `[Save]`. | Preference updated and reflected in the list column. |
| T03-06 | Disable a member | Click `[Edit]` on a member → toggle Enabled to Off → click `[Save]`. | Member row shows as disabled (greyed or flagged). Member no longer appears in the Dashboard notification selection. |
| T03-07 | Re-enable a member | Click `[Edit]` on the disabled member → toggle Enabled to On → click `[Save]`. | Member is restored to active status and reappears in Dashboard. |
| T03-08 | Delete a single member | Click `[Delete]` on a non-critical test member → confirm the prompt. | Member is removed from the list. Event log records "Member Deleted". |
| T03-09 | Discover members from OSM | Click `[Discover from OSM]` (or equivalent import button). | A list of members found in OSM data but not yet in the local DB is displayed. |
| T03-10 | Bulk import discovered members | Select all discovered members → click `[Import]`. | Selected members are added to the member list. A toast confirms how many were imported. |
| T03-11 | Bulk delete members | Select two or more members via checkboxes → click `[Bulk Delete]` → confirm. | Selected members are removed. Toast confirms count. Event log records the bulk deletion. |
| T03-12 | Pagination | If more than 25 members exist, observe the pagination bar at the bottom. | Pagination shows "Showing X–Y of Z". Clicking `[Next]` loads the next page. Rows-per-page selector works correctly. |
| T03-13 | Change rows per page | Select `50` in the Rows-per-page dropdown. | Table updates to show up to 50 rows. Preference is persisted across page reload. |

---

## T04 — Skills Management

**Page:** `skills.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T04-01 | Page load | Navigate to `skills.html`. | Skills list loads with Name, Critical flag, Enabled, and linked Form/URL columns. |
| T04-02 | Add a new skill | Click `[Add Skill]` → fill in Name = `{Test Skill}` → click `[Save]`. | New skill appears in the list. Event log records "Skill Created". |
| T04-03 | Mark skill as critical | Click `[Edit]` on a skill → toggle Critical to On → click `[Save]`. | Skill shows a critical indicator (e.g., warning badge). Dashboard and Reports reflect the critical flag. |
| T04-04 | Link skill to external URL | Click `[Edit]` → choose URL type = External → enter a valid URL → click `[Save]`. | URL is saved. The Dashboard cell for that skill becomes a clickable link to the external URL. |
| T04-05 | Link skill to an app-hosted form | Click `[Edit]` → choose URL type = App Form → select a form from the dropdown → click `[Save]`. | Form link is saved. Dashboard cell shows a form icon/link for that skill. |
| T04-06 | Disable a skill | Click `[Edit]` → toggle Enabled to Off → click `[Save]`. | Skill is hidden from the active Dashboard view. Still visible in the Skills management list as disabled. |
| T04-07 | Re-enable a skill | Toggle Enabled back to On → click `[Save]`. | Skill reappears in the Dashboard. |
| T04-08 | Delete a skill | Click `[Delete]` on the test skill → confirm. | Skill is removed from the list. Event log records "Skill Deleted". |
| T04-09 | Discover skills from OSM | Click `[Discover from OSM]`. | A list of skill names found in OSM data but not yet in the local DB is shown. |
| T04-10 | Bulk import discovered skills | Select all → click `[Import]`. | New skills are added to the list. Toast confirms count. |
| T04-11 | Bulk delete skills | Select multiple test skills → click `[Bulk Delete]` → confirm. | Skills removed. Event log records bulk deletion. |

---

## T05 — Forms Management (Form Builder)

**Page:** `forms-manage.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T05-01 | Page load | Navigate to `forms-manage.html`. | List of form templates is shown with Name, Status, Question count. |
| T05-02 | Create a new form | Click `[New Form]` → enter Name = `{Test Form}`, Introduction text → click `[Save]`. | Form appears in the list. Event log records "Form Created". |
| T05-03 | Add a text question | Open the new form in the builder → click `[Add Question]` → select type = Short Text → enter question text and a model answer → set point value = `10` → click `[Save Question]`. | Question appears in the form preview with its point value. |
| T05-04 | Add a multiple-choice question | Click `[Add Question]` → select type = Multiple Choice → add 4 options, mark the correct one → set point value = `5` → click `[Save Question]`. | Question saved with correct answer marked. |
| T05-05 | Add a checkbox question | Click `[Add Question]` → select type = Checkbox → add 3 options, mark 2 as correct → set point value = `6` → click `[Save Question]`. | Question saved. Points are configured for partial credit. |
| T05-06 | Set pass threshold | In form settings, set Pass Threshold = `70%` (or raw points equivalent) → click `[Save]`. | Threshold is saved. Visible in the form summary. |
| T05-07 | Set max attempts | Set Max Attempts = `3` → click `[Save]`. | Value is saved and displayed. |
| T05-08 | Enable AI evaluation | Toggle AI Evaluation to On → click `[Save]`. | AI evaluation flag is saved. Long-text answers will be sent to the AI provider on submission. |
| T05-09 | Enable a form | Set form Status = Enabled → click `[Save]`. | Form shows as Enabled in the list. It can now be linked to skills and issued to members. |
| T05-10 | Disable a form | Set Status = Disabled → click `[Save]`. | Form shows as Disabled. Cannot be issued to new members while disabled. |
| T05-11 | Export a single form | Click `[Export]` on the test form. | A JSON file is downloaded containing the form definition. |
| T05-12 | Export all forms | Click `[Export All]`. | A JSON file is downloaded containing all form templates. |
| T05-13 | Import a single form | Click `[Import Form]` → upload the previously exported JSON. | Form is imported and appears in the list. Toast confirms import. |
| T05-14 | Delete a form | Click `[Delete]` on the test form → confirm. | Form is removed. Event log records "Form Deleted". |
| T05-15 | View form usage | Click `[Usage]` on a form that has live form records. | A count of linked live form submissions is displayed. |

---

## T06 — Live Forms (Submission Review)

**Page:** `live-forms.html`  
**Prerequisites:** At least one live form record exists (issued via Dashboard or skill link).

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T06-01 | Page load | Navigate to `live-forms.html`. | Table of live form records loads with Member, Skill, Status, Tries, Submitted Date columns. |
| T06-02 | Filter by status | Use the Status filter dropdown → select `Submitted`. | Only submitted (pending review) records are shown. |
| T06-03 | Filter by member name | Type a member name in the search filter. | List narrows to records for that member. |
| T06-04 | Filter by skill | Use the Skill filter dropdown → select a skill. | List shows only records for that skill. |
| T06-05 | Filter by date range | Enter a Start Date and End Date in the date filters. | Only records submitted within that date range are shown. |
| T06-06 | Review a submission | Click `[Review]` on a submitted record. | Detail view opens showing each answer, colour-coded (green = correct, red = incorrect, yellow = partial). AI feedback is shown for paragraph answers. Score and pass/fail status are displayed. |
| T06-07 | Accept a submission | In the review view, enter a custom comment → click `[Accept]`. | Status changes to Accepted. A toast confirms. Email/WhatsApp notification is sent to the member (check member's inbox). Event log records "Live Form Accepted". |
| T06-08 | Reject a submission | In the review view, enter a rejection comment → click `[Reject]`. | Status changes to Rejected. Notification sent to member. Event log records "Live Form Rejected". |
| T06-09 | Reject and issue retry link | Reject a submission with the `[Generate Retry Link]` option checked. | A new live form record is created for that member/skill (Status = Sent). The rejection notification includes the new access link. |
| T06-10 | Archive a record | Click `[Archive]` on a processed record. | Record disappears from the default view (archived records are hidden by default). |
| T06-11 | Show archived records | Toggle the `[Show Archived]` filter on. | Archived records reappear in the list, visually distinguished. |
| T06-12 | Unarchive a record | With archived records visible, click `[Unarchive]` on a record. | Record returns to the normal unarchived view. |
| T06-13 | Delete a single record | Click `[Delete]` on a record → confirm. | Record is permanently removed. Event log records deletion. |
| T06-14 | Purge filtered records | Apply a filter (e.g., Status = Archived) → click `[Purge Filtered]` → confirm. | All matching records are deleted. Toast confirms count. Event log records purge. |
| T06-15 | Export records | Click `[Export]`. | A JSON file is downloaded with the currently filtered records. |
| T06-16 | Pagination | Observe bottom pagination bar. | Rows-per-page selector works; "Showing X–Y of Z" updates correctly; Previous/Next navigate pages. |

---

## T07 — Surveys Management (Survey Builder)

**Page:** `surveys-manage.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T07-01 | Page load | Navigate to `surveys-manage.html`. | List of survey templates is shown with Name, Anonymous flag, Status, Published instances count. |
| T07-02 | Create a new survey | Click `[New Survey]` → enter Name = `{Test Survey}`, Introduction text, set Anonymous = Yes → click `[Save]`. | Survey template appears in the list. Event log records "Survey Created". |
| T07-03 | Add a text question | Open the survey in the builder → click `[Add Question]` → select type = Text → enter question text → click `[Save Question]`. | Question appears in the preview. |
| T07-04 | Add a rating question | Click `[Add Question]` → select type = Rating (1–5) → enter question text → click `[Save Question]`. | Rating question saved and previewed. |
| T07-05 | Add a yes/no question | Add a Yes/No type question. | Question saved with Yes/No options. |
| T07-06 | Reorder questions | Drag a question to a new position (if drag-and-drop supported) or use Up/Down arrows. | Question order updates in the preview. |
| T07-07 | Enable the survey | Set Status = Active → click `[Save]`. | Survey shows as Active. It can now be published. |
| T07-08 | Publish a survey | Click `[Publish]` on an active survey → confirm. | A live survey instance is created. Unique tracking links are generated per member. Invitation emails are sent (if email configured). A success toast shows instance count and emails queued. |
| T07-09 | Export a survey template | Click `[Export]` on the survey. | JSON file downloaded with survey definition. |
| T07-10 | Export all surveys | Click `[Export All]`. | JSON file downloaded with all templates. |
| T07-11 | Import a survey template | Click `[Import]` → upload the exported JSON. | Template imported and appears in the list. |
| T07-12 | Delete a survey template | Click `[Delete]` → confirm. | Template removed. Any live instances remain unless separately deleted. Event log records "Survey Deleted". |

---

## T08 — Live Surveys (Instance Monitoring)

**Page:** `live-surveys.html`  
**Prerequisite:** At least one published survey instance exists (from T07-08).

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T08-01 | Page load | Navigate to `live-surveys.html`. | List of live survey instances with Name, Published Date, Completion progress bar, Archived status. |
| T08-02 | View progress bar | Observe the progress bar for a published instance. | Bar shows the percentage of members who have submitted responses. |
| T08-03 | Navigate to tracking | Click `[Tracking]` on a live instance. | Redirected to `surveys-tracking.html` scoped to that instance. |
| T08-04 | Navigate to results | Click `[Results]` on a live instance. | Redirected to `surveys-results.html` scoped to that instance. |
| T08-05 | Archive an instance | Click `[Archive]` on a live instance → confirm. | Instance is marked archived. Further submissions via the public link are blocked (member sees a "Survey closed" message). |
| T08-06 | Unarchive an instance | Click `[Unarchive]` on an archived instance. | Instance becomes active again. Pending members can resume submitting. |
| T08-07 | Delete an instance | Click `[Delete]` on a test instance → confirm. | Instance and all its tracking/response data are permanently deleted. Event log records "Survey Instance Deleted". |
| T08-08 | Pagination | If multiple instances exist, observe pagination. | Pagination controls work and rows-per-page preference is persisted. |

---

## T09 — Survey Tracking & Results

**Pages:** `surveys-tracking.html`, `surveys-results.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T09-01 | Tracking page load | Open tracking for a published instance. | Table shows each member with status: Pending or Submitted. |
| T09-02 | Copy a member's unique link | Click `[Copy Link]` next to a pending member. | The unique survey access link is copied to the clipboard. Pasting it confirms it is a valid URL. |
| T09-03 | Send a single reminder | Click `[Remind]` next to a pending member. | Reminder email is sent to that member. Toast confirms. Event log records the reminder. |
| T09-04 | Send bulk reminders | Click `[Remind All Pending]` → confirm. | Reminder emails are sent to all pending members. Toast confirms count. |
| T09-05 | Results page load | Open results for a published instance that has at least one response. | Aggregated charts (bar/doughnut) are shown for closed questions. Free-text responses are listed. Participation count (responded / total) is shown. |
| T09-06 | View individual response (non-anonymous) | For a non-anonymous survey, click a response entry. | Response detail shows the answers and the member's name/ID. |
| T09-07 | Anonymous response privacy | For an anonymous survey, open the results page. | Responses are shown but no member name or identifier is linked to any individual response. |

---

## T10 — Training Planner

**Page:** `training-planner.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T10-01 | Page load | Navigate to `training-planner.html`. | Calendar view and/or list view loads. Available skills are displayed for scheduling. |
| T10-02 | Schedule a training session | Click on a future date on the calendar (or use `[Add Session]`) → select a skill from the dropdown → optionally set a location/notes → click `[Save]`. | Session appears on the calendar on the chosen date. Event log records "Training Session Created". |
| T10-03 | View session in list | Switch to the list view. | The newly created session appears in the list with date, skill, and location. |
| T10-04 | Filter by training day | Use the training-day filter to show only sessions on a specific date. | List narrows to sessions on that date. |
| T10-05 | Delete a training session | Click `[Delete]` on a session → confirm. | Session is removed from the calendar and list. Event log records "Training Session Deleted". |
| T10-06 | Pagination (list view) | If more than 25 sessions exist, observe pagination. | Pagination controls and rows-per-page preference work as expected. |
| T10-07 | Verify in Reports | Navigate to Reports → select "Planned Sessions" view. | The scheduled sessions appear in the report. |

---

## T11 — Reports

**Page:** `reports.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T11-01 | Page load | Navigate to `reports.html`. | Report type selector is visible. No data is displayed until a report is selected. |
| T11-02 | Report: By Member | Select "By Member" → choose a member from the dropdown → click `[Generate]`. | Report shows all skills for that member with expiry dates and compliance status. |
| T11-03 | Report: By Skill | Select "By Skill" → choose a skill → click `[Generate]`. | Report shows all members' status for that skill. |
| T11-04 | Report: Planned Sessions | Select "Planned Sessions" → click `[Generate]`. | Report shows all scheduled in-person training sessions with dates and skills. |
| T11-05 | Report: Critical Overdue | Select "Critical Overdue" → click `[Generate]`. | Report lists only members with overdue critical skills, sorted by urgency. |
| T11-06 | Report: Compliance Matrix | Select "Compliance Matrix" → click `[Generate]`. | A matrix grid shows all members (rows) × all skills (columns) with colour-coded compliance cells. |
| T11-07 | Report: Verification History | Select "Verification History" → click `[Generate]`. | Report shows accepted live form submissions with member, skill, score, and accepted date. |
| T11-08 | Report: Training Attendance | Select "Training Attendance" → click `[Generate]`. | Report shows in-person sessions with their planned dates (attendance data where available). |
| T11-09 | Print a report | After generating any report, click `[Print]`. | Browser print dialog opens with a print-optimised layout. |
| T11-10 | Export a report to PDF | Click `[Export PDF]` (if available). | A PDF file is downloaded containing the report. |
| T11-11 | Change rows per page | Use the Rows-per-page selector on a report with many rows. | Table updates immediately and preference persists on next page load. |

---

## T12 — Statistics

**Page:** `statistics.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T12-01 | Page load | Navigate to `statistics.html`. | Compliance doughnut chart and skill priority breakdown are rendered. Summary figures are correct. |
| T12-02 | Verify compliance chart | Observe the doughnut chart sections. | Segments represent Current, Expiring Soon, Overdue, Unknown proportions matching the member data. |
| T12-03 | Skill priority breakdown | Observe the priority breakdown chart or table. | Shows distribution of members by urgency level across all skills. |
| T12-04 | Export PDF snapshot | Click `[Export PDF]`. | A PDF snapshot of the statistics page is downloaded. |

---

## T13 — Communication Templates

**Page:** `templates.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T13-01 | Page load | Navigate to `templates.html`. | List of template categories (Email, WhatsApp) is shown. Existing templates are loaded. |
| T13-02 | Edit email template | Click `[Edit]` on an email template (e.g., skill expiry notification) → change the subject line and body text, use `{{name}}` and `{{skill}}` variables → click `[Save]`. | Template is saved. Toast confirms success. Event log records the update. |
| T13-03 | Preview template variables | Check that the template body uses supported variables: `{{name}}`, `{{email}}`, `{{skill}}`, `{{custom_comment}}`, `{{url}}`, `{{surveyLink}}`. | Variables are visible in the template text as placeholder tokens. |
| T13-04 | Edit WhatsApp template | Click `[Edit]` on a WhatsApp template → update the markdown body text → click `[Save]`. | Template is saved. Toast confirms. |
| T13-05 | Verify template is used in notifications | Send a test notification from the Dashboard → check recipient's inbox. | The email received reflects the edited template content and correctly substituted variable values. |

---

## T14 — User Management

**Page:** `users.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T14-01 | Page load | Navigate to `users.html`. | List of system user accounts with Name, Email, Role, Enabled/Blocked status columns. |
| T14-02 | Create a new user | Click `[Add User]` → enter Name = `{UAT Test User}`, Email = `{uattest@example.com}`, Role = `admin` → click `[Save]`. | New user appears in the list. A temporary password is generated and sent via email. Event log records "User Created". |
| T14-03 | Edit user name and email | Click `[Edit]` on the test user → change Name and Email → click `[Save]`. | Updated details reflected in the list. Event log records "User Updated". |
| T14-04 | Change user role | Click `[Edit]` → change Role to `simple` → click `[Save]`. | Role is updated. Toast confirms. |
| T14-05 | Disable a user account | Click `[Edit]` → toggle Enabled to Off → click `[Save]`. | User account is disabled. That user can no longer log in (test by attempting login in a separate browser session). |
| T14-06 | Re-enable a user account | Toggle Enabled back to On → click `[Save]`. | User can log in again. |
| T14-07 | Reset a user's password | Click `[Reset Password]` on a user → confirm. | A new temporary password is generated and emailed to the user. Event log records "Password Reset". |
| T14-08 | Unblock a locked account | If a test user is blocked (T01-03 was used on their account), click `[Unblock]`. | Account unblocked. User can now attempt login. Event log records "Account Unblocked" under Security category. |
| T14-09 | Delete a user | Click `[Delete]` on the test user → confirm. | User is removed from the list. A deletion notification email is sent. Event log records "User Deleted". |

---

## T15 — Event Log

**Page:** `event-log.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T15-01 | Page load | Navigate to `event-log.html`. | Audit log table loads with Timestamp, Actor, Category, Title, Payload columns. Recent events from the test session are visible. |
| T15-02 | Filter by category | Use the Category filter → select `Member`. | Only Member category events are shown. |
| T15-03 | Filter by date range | Enter a Start and End date spanning the current test session. | Events within that range are shown; events outside are hidden. |
| T15-04 | View event payload | Click on an event row or expand the payload cell. | Full JSON payload is shown, confirming actor, IDs, names, and any state captured. |
| T15-05 | Export filtered events | Apply a filter → click `[Export]`. | A JSON file is downloaded containing only the filtered events. |
| T15-06 | Prune old events | Click `[Prune]` → enter `90` days → confirm. | Events older than 90 days are deleted. Toast confirms how many were removed. Event log records "Events Pruned". |
| T15-07 | Purge all events | Click `[Purge All]` → confirm. | All event log entries are deleted. Table shows empty. Toast confirms. (In demo mode: this action should be blocked.) |
| T15-08 | Pagination | Observe the pagination bar at the bottom of the log. | Rows-per-page selector, Previous/Next buttons, and "Showing X–Y of Z" counter work correctly. Preference persists on reload. |

---

## T16 — Third-Party Integrations (WhatsApp)

**Page:** `third-parties.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T16-01 | Page load | Navigate to `third-parties.html`. | WhatsApp service status panel is shown. Current status (Disconnected / Initialising / Ready) is displayed. |
| T16-02 | Start WhatsApp service | Click `[Start WhatsApp]`. | Status changes to "Initialising". A QR code appears within a few seconds. |
| T16-03 | Scan QR code | Use the WhatsApp mobile app → Linked Devices → scan the QR code on screen. | Status changes to "Ready". QR code disappears. Event log records "WhatsApp Client Connected". |
| T16-04 | Verify connection persists | Leave the page and return after 2+ minutes. | Status still shows "Ready". No manual reconnection required. |
| T16-05 | Toggle auto-disconnect | Toggle the auto-disconnect option. | Setting is saved. Toast confirms. |
| T16-06 | Disconnect WhatsApp | Click `[Disconnect WhatsApp]` → confirm. | Status changes to "Disconnected". Event log records "WhatsApp Client Disconnected". |
| T16-07 | Auto-reconnect (if disconnect is unexpected) | This is observed during normal operation: if the WhatsApp session is dropped by the server, verify that the service attempts reconnection automatically with exponential backoff. | Status cycles through "Reconnecting" and returns to "Ready" without manual intervention. |

---

## T17 — System Tools

**Page:** `system-tools.html`  
**Access:** Superadmin only

### T17-A — Database Backup & Restore

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-01 | Page load | Navigate to `system-tools.html`. | Backup, Restore, API Keys, and AI Lab sections are all visible. |
| T17-02 | Create a database backup | Click `[Download Backup]`. | A `.sql` file is downloaded containing a complete SQL dump of the application database. File size is non-zero. |
| T17-03 | Restore from backup | Create a test member. Download a new backup. Delete the test member. Click `[Restore]` → upload the backup file → confirm. | Application restores to the backed-up state. The test member reappears. Event log records "Database Restored". |
| T17-04 | Demo mode blocks restore | If testing on a demo-mode instance, click `[Restore]`. | Action is blocked with an error: "Disabled in demo mode." No data is changed. |

### T17-B — API Key Management

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-05 | Create an API key for each role | Click `[Create API Key]` → enter a name, select Role = `superadmin` → click `[Generate]`. Repeat for roles `admin`, `simple`, and `guest`. | For each creation: the full API key (`osm_...`) is displayed once; the key appears in the list with the correct role label. Event log records "API Key Created" for each. |
| T17-06 | Copy the API key | Click `[Copy]` next to the displayed key. | Key is copied to the clipboard. The full key value is NOT shown again after closing this dialog. |
| T17-07 | Verify API key works | Use the copied `admin` key in a REST client (e.g., Postman): `GET /api/members` with header `X-API-Key: {copied_key}`. | HTTP 200 response with member data is returned. |
| T17-08 | Disable (toggle) an API key | Click `[Toggle]` on the active API key. | Key status changes to Disabled. Event log records "API Key Toggled" with `newState: disabled`. |
| T17-09 | Verify disabled key is rejected | Retry the API request from T17-07 with the now-disabled key. | HTTP 403 response. Request is rejected. |
| T17-10 | Re-enable an API key | Click `[Toggle]` again. | Key status returns to Active. Event log records "API Key Toggled" with `newState: enabled`. |
| T17-11 | Delete an API key | Click `[Delete]` → confirm. | Key is removed from the list. Event log records "API Key Deleted". Subsequent requests with that key return 403. |

### T17-C — AI Evaluator Sandbox

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-12 | Open AI test lab | Scroll to the AI Evaluator section. | Input fields for Question, Reference Answer, Candidate Answer, and AI Provider are visible. |
| T17-13 | Run an AI evaluation (Gemini) | Select Provider = Gemini → fill in a question, reference answer, and candidate answer → click `[Evaluate]`. | An AI-generated score and feedback is returned and displayed. No error is shown. |
| T17-14 | Run an AI evaluation (Ollama) | If Ollama is configured, switch Provider = Ollama → select a model → run evaluation. | Score and feedback returned from the local Ollama model. |
| T17-15 | Ollama model list | If Ollama is connected, observe the model dropdown. | Available models are listed and selectable. |

---

## T18 — Profile Management

**Page:** `profile.html`

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T18-01 | Page load | Navigate to `profile.html`. | Current user's Name, Email are shown. Password change and MFA sections are present. |
| T18-02 | Update display name | Change the Name field → click `[Save Profile]`. | Name is updated. Navigation and header reflect the new name. Event log records "Profile Updated". |
| T18-03 | Update email | Change the Email field to a valid address → click `[Save Profile]`. | Email is updated. Confirmation toast shown. |
| T18-04 | Change password | Enter the current password → enter a new password → confirm → click `[Change Password]`. | Password is updated. Toast confirms. The user can log out and log back in with the new password. |
| T18-05 | Change password — wrong current password | Enter an incorrect current password → submit. | Error message shown: "Current password is incorrect." Password is not changed. |
| T18-06 | Enable MFA | Click `[Enable MFA]`. | A QR code is displayed for scanning with an authenticator app (e.g., Google Authenticator, Authy). |
| T18-07 | Complete MFA setup | Scan the QR code → enter the 6-digit TOTP code → confirm. | MFA is enabled. Confirmation toast shown. |
| T18-08 | MFA is required on next login | Log out → log back in with valid credentials. | After entering username/password, a second step prompts for the TOTP code. |
| T18-09 | Disable MFA | In profile settings, click `[Disable MFA]` → confirm current password or TOTP. | MFA is disabled. Next login requires only username/password. |

---

## T19 — Cross-Cutting Concerns

### T19-A — Dark / Light Mode

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T19-01 | Toggle to dark mode | Click the theme toggle button (sun/moon icon) in the navigation. | The entire app switches to dark background with light text. All pages honour the theme. |
| T19-02 | Persist theme across reload | With dark mode active, reload the page. | Dark mode is retained. No flash of light mode on load. |
| T19-03 | Toggle back to light mode | Click the toggle again. | App returns to light theme. |

### T19-B — Pagination & Table Sorting (Global Check)

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T19-04 | Rows-per-page preference persists | On any paginated page, change rows per page to `50` → navigate away → return. | Rows per page is still `50`. |
| T19-05 | Sort order persists (if applicable) | Sort a column → navigate away → return. | The saved sort column and direction are restored. |
| T19-06 | "All" rows option | Select `All` in the rows-per-page dropdown. | All records are shown on a single page with no pagination controls active. Preference stored as the string `"all"`. |

### T19-C — Mobile Layout

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T19-07 | 375 px viewport | Resize the browser to 375 px width (or use DevTools mobile emulation). | Navigation collapses to a mobile-friendly layout. Tables scroll horizontally. No content is clipped or overlapping. |
| T19-08 | 768 px viewport | Test at 768 px width (tablet breakpoint). | Layout is usable. No broken grid or overflow. |

### T19-D — Floating Action Buttons

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T19-09 | Home button | On any non-Dashboard page, scroll down → click the floating `[Home]` button. | Navigates back to the Dashboard. |
| T19-10 | Scroll-to-top button | On a long page, scroll down → click the floating `[↑]` button. | Page scrolls smoothly to the top. |
| T19-11 | Help button | On any page, click the floating `[?]` button. | A modal opens with contextual help text relevant to the current page. Modal closes on `[Close]` or clicking outside. |

### T19-E — Demo Mode (when testing on demo instance)

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T19-12 | Destructive actions blocked | Attempt any delete, purge, or restore action on a demo-mode instance. | Action is blocked with the message "Disabled in demo mode." No data is changed. |
| T19-13 | Destructive buttons disabled | Observe destructive buttons in the UI. | Buttons are visually disabled (greyed out or marked) on demo-mode instances. |

---

## T20 — System Health & API (Technical Verification)

**Purpose:** Confirm the server is healthy and all API endpoints are reachable and correctly secured.

> **T20-01, T20-02, T20-03 and all core API list endpoints are automated via Newman.**
> Run `npm run test:api` (after one-time setup of `examples/api/newman-environment.local.json`) to execute them automatically.
> See README — *API smoke tests (Newman)* section for setup instructions.
> T20-04 remains manual as it requires a separately provisioned simple-role API key.

| ID | Action | Steps | Expected Result | Automated? |
|----|--------|-------|----------------|-----------|
| T20-01 | Health endpoint | Run `npm run test:api` — or open `/api/system/health` in a browser. | JSON `{ "status": "ok", "db": "connected", "version": "..." }`. HTTP 200. | ✅ Newman |
| T20-02 | API docs accessible | Run `npm run test:api` — or navigate to `/api/docs` and verify Swagger UI loads with all endpoint groups. | HTTP 200. All endpoint groups visible and expandable. | ✅ Newman |
| T20-03 | Unauthenticated access blocked | Run `npm run test:api` — or in a logged-out browser navigate to `/api/members`. | HTTP 401/302/403. No member data exposed. | ✅ Newman |
| T20-04 | API key role enforcement | Create a `simple`-role API key → call `POST /api/system/restore` using that key (e.g. via Postman or curl). | HTTP 403. Access denied based on key role. | Manual |

---

## Appendix A — Test Data Setup Checklist

Before starting the UAT run, ensure the following data is in place on the UAT instance:

- [ ] At least **10 members** imported or created, with varied expiry dates (some overdue, some expiring soon, some current).
- [ ] At least **5 skills** configured; at least 1 marked critical; at least 1 linked to a form; at least 1 linked to an external URL.
- [ ] At least **2 form templates** with mixed question types (MC, text, checkbox); 1 enabled, 1 disabled.
- [ ] At least **1 live form record** in `Submitted` status, ready for review.
- [ ] At least **1 survey template** (anonymous) with 3+ questions; 1 published instance.
- [ ] At least **2 training sessions** scheduled on future dates.
- [ ] At least **1 non-superadmin user** (admin or simple role) for role testing.
- [ ] SMTP email configured and a reachable test inbox available.
- [ ] WhatsApp service configured with a test device (for T16 tests).
- [ ] AI provider configured (Gemini API key or Ollama running) for T17-C tests.

---

## Appendix B — Event Log Verification Matrix

After completing the full UAT run, verify the Event Log (`event-log.html`) contains entries for each of the following categories:

| Category | Expected entries |
|----------|-----------------|
| `Member` | Created, Updated, Deleted, Bulk Deleted |
| `Skill` | Created, Updated, Deleted |
| `Forms` | Created, Updated, Deleted, Imported |
| `Live Forms` | Accepted, Rejected, Archived, Deleted, Purged |
| `Surveys` | Published, Instance Archived, Instance Deleted |
| `Training` | Session Created, Session Deleted |
| `User Mgmt` | User Created, Updated, Deleted, Password Reset |
| `Security` | Account Unblocked (if T14-08 was run) |
| `API Keys` | Key Created, Key Toggled, Key Deleted |
| `System` | Database Restored (if T17-03 was run), Events Pruned |
| `WhatsApp` | Client Connected, Client Disconnected |

All entries must include: a non-empty `actor` name, a timestamp, a meaningful `title`, and a populated `payload` object (never `{}`).

---

*Document version: see git history. Maintained as part of the OpReady developer skill — update this plan whenever a new page, feature, or operation is added, modified, or removed.*
