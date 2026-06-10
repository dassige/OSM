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
| T01-07 | Forgot password — request reset link | On the login page click `[Forgot Password?]` → enter a registered email address → submit. | A toast or message confirms that if the address is registered, a reset link will be sent. The response is identical whether the email exists or not. An email arrives containing a "Reset link" clickable anchor. |
| T01-08 | Forgot password — complete reset via link | Click the reset link in the email → enter a new password (8+ characters) → confirm → click `[Set New Password]`. | Success message is shown. Navigating to `/login.html` → logging in with the new password succeeds. The old password no longer works. |
| T01-09 | Forgot password — expired or invalid token | Manually alter the token in the reset URL (e.g., append an extra character) → submit the form. | The page shows "This reset link is invalid or has expired." The form is hidden. A link to return to the login page is shown. |

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
| T11-12 | Report: Survey Participation | Select "Survey Participation Overview" → click `[Run Report]`. | Table appears showing all published survey campaigns with Name, Published date, Sent, Responded, Response Rate %, Type, and Status columns. |
| T11-13 | Report: Survey Response Log | Select "Survey Response Log" → optionally change Lookback Period → click `[Run Report]`. | Paginated log shows survey responses for the period. Anonymous survey respondents display as *Anonymous*. |

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
| T13-06 | Forgot Password template tab | Click the **Forgot Password** tab in `templates.html` → edit the body to include the `{{resetlink}}` chip → click `[Save All Templates]` → trigger a forgot-password request from the login page. | The received email renders `{{resetlink}}` as a clickable "Reset link" anchor. `{{password}}` is not available in this tab's variable palette. |

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
| T15-09 | Login event geo-location | Log in from a routable public IP. Navigate to `event-log.html`. Filter by category `Security`. Click the `ℹ` info button on the "Successful Login" entry. | The event detail modal shows a highlighted panel above the JSON payload displaying the Source IP and its resolved geographic location (city and country, e.g. "Auckland, NZ"). |

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

### T17-A — Navigation & Tabs

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-01 | Page load | Navigate to `system-tools.html`. | Page loads. Two tabs are visible: **Knowledge Base** (active by default) and **AI**. The Knowledge Base tab shows the Rotate Document Links and Find Documents with Missing Files cards. |
| T17-03 | Tab switching | Click the **AI** tab. | The AI Evaluator Test Lab card becomes visible and the AI tab is highlighted as active. Click the **Knowledge Base** tab — the KB tools reappear. |

### T17-C — AI Evaluator Sandbox

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-12 | Open AI test lab | Click the **AI** tab. | Input fields for Question, Reference Answer, Candidate Answer, and AI Provider are visible. |
| T17-13 | Run an AI evaluation (Gemini) | Select Provider = Gemini → fill in a question, reference answer, and candidate answer → click `[Evaluate]`. | An AI-generated score and feedback is returned and displayed. No error is shown. |
| T17-14 | Run an AI evaluation (Ollama) | If Ollama is configured, switch Provider = Ollama → select a model → run evaluation. | Score and feedback returned from the local Ollama model. |
| T17-15 | Ollama model list | If Ollama is connected, observe the model dropdown. | Available models are listed and selectable. |

### T17-D — Knowledge Base Maintenance

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T17-16 | Scan for missing files — all present | The **Knowledge Base** tab is active by default; if not, click it. Click `[Scan for Missing Files]`. | A green success message is displayed: "All N documents have their files intact." No table appears. |
| T17-17 | Verify scan API response shape | Call `GET /api/knowledgebase/documents/missing-files` with a valid API key (admin or above). | HTTP 200 response with shape `{ "total": <integer>, "missing": [...] }`. The `missing` array contains only documents whose physical file is absent from storage. |

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
| T20-05 | Readiness probe | Run `npm run test:api` — or open `/api/ready` in a browser (no login required). | HTTP 200. JSON `{ "status": "ready", "db": "ok", "whatsapp": "disabled" }` (or `{ "status": "...", "queueSize": N }` if WhatsApp is enabled). | ✅ Newman |
| T20-06 | Correlation ID header | Using Postman or curl, call any authenticated endpoint (e.g. `GET /api/health`) without an `X-Request-Id` header. Then repeat with `X-Request-Id: my-trace-123`. | First call: response includes `X-Request-Id` header containing a UUID. Second call: response echoes back `X-Request-Id: my-trace-123`. | Manual |
| T20-07 | Members pagination | Call `GET /api/members` with no params. Then call `GET /api/members?limit=5&offset=0&sortBy=name&sortDir=asc`. | First call: plain JSON array. Second call: JSON object `{ items: [...], total: N, limit: 5, offset: 0 }`. `items` contains ≤ 5 members sorted by name ascending. | ✅ Newman |
| T20-08 | Members search filter | Call `GET /api/members?limit=100&search=<partial-name>` where `<partial-name>` is a known substring of at least one member's name. | Response `{ items, total }` where every item's `name` contains the search string (case-insensitive) and `total` equals `items.length`. | Manual |
| T20-09 | Skills pagination | Call `GET /api/skills` with no params. Then call `GET /api/skills?limit=5&offset=0&sortBy=name&sortDir=asc`. | First call: plain JSON array. Second call: JSON object `{ items: [...], total: N, limit: 5, offset: 0 }`. `items` contains ≤ 5 skills sorted by name ascending. | ✅ Newman |
| T20-10 | Skills search filter | Call `GET /api/skills?limit=100&search=<partial-name>` where `<partial-name>` is a known substring of at least one skill's name. | Response `{ items, total }` where every item's `name` contains the search string (case-insensitive) and `total` equals `items.length`. | Manual |
| T20-11 | Public submission rate limit | Using curl or Postman, send more than 30 requests in 5 minutes to `GET /api/live-surveys/<any-code>` (no auth needed). | After the 30th request within the window the server responds with HTTP 429. The `RateLimit-*` headers are present on all responses. Prior requests return normal responses. | Manual |
| T20-12 | CSRF token endpoint | While logged in as admin, call `GET /api/csrf-token`. | Response is HTTP 200 with JSON `{ "token": "<64-char hex string>" }`. Token matches pattern `[0-9a-f]{64}`. Calling the endpoint again returns the same token (stable per session). | Manual |
| T20-13 | CSRF protection on mutations | While logged in as admin, use Postman to send `POST /api/members` with a valid body but **without** the `X-CSRF-Token` header. Then repeat the request **with** `X-CSRF-Token: <token from T20-12>`. | First request: HTTP 403 with `{ "error": "Invalid or missing CSRF token." }`. Second request: HTTP 200 and member is created. | Manual |
| T20-14 | Member input validation | While logged in as admin, send `POST /api/members` with an empty body `{}`. Then send a body missing the `name` field (e.g. `{ "email": "test@test.com" }`). | Both requests return HTTP 400 with `{ "error": "Validation Failed", "details": [...] }`. The `details` array names the failing field(s). No member is created. | Manual |
| T20-15 | Skill input validation | While logged in as admin, send `POST /api/skills` with body `{ "name": "Test" }` (missing required `url_type`). Then send `{ "name": "Test", "url_type": "bad-value" }` (invalid enum). | Both requests return HTTP 400 with `{ "error": "Validation Failed", "details": [...] }`. No skill is created. | Manual |

---

## T21 — Progressive Web App (PWA)

**Purpose:** Verify that OpReady is installable, provides an offline fallback, and meets core PWA requirements.

> These tests must be performed in a browser that supports PWA installation (Chrome, Edge, or Android Chrome). Safari on iOS supports "Add to Home Screen" but does not fire the `beforeinstallprompt` event — test separately where noted.

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T21-01 | Manifest accessible | Navigate to `/manifest.json` in the browser. | HTTP 200. JSON file with `name`, `icons`, `start_url`, `display: standalone`, and `theme_color`. Content-Type is `application/manifest+json`. |
| T21-02 | Service worker registers | Open Chrome DevTools → Application → Service Workers. Load any app page. | A service worker for the site is listed with status `activated and is running`. No registration errors in the Console. |
| T21-03 | Install banner appears (Chrome/Edge) | Open the app in Chrome or Edge on a device where it is not yet installed. Wait a few seconds on any authenticated page. | A teal install banner slides in at the top of the page with an **Install** button and a dismiss (×) button. |
| T21-04 | Install from banner | With the install banner visible, click **Install**. | The browser install prompt appears. Accepting it installs the app. The banner disappears. The app is added to the home screen / taskbar. |
| T21-05 | Banner dismiss | Show the install banner (see T21-03). Click the × button. | The banner slides out and is removed. Refreshing the page does not re-show the banner within the same session. |
| T21-06 | Standalone display | Open the installed PWA from the home screen or taskbar. | The app opens without browser chrome (no address bar). The title bar or status bar reflects the teal theme colour (`#17A2B8`). |
| T21-07 | Offline fallback page | Install the app or open in Chrome. In DevTools → Network, enable **Offline** throttling. Navigate to any app page. | The `offline.html` page is displayed with the OpReady icon, "You're offline" message, and a **Try again** button. No white blank screen or browser error page. |
| T21-08 | Cached page served offline | Load the dashboard at least once online. Enable Offline in DevTools. Reload the dashboard. | The cached dashboard page is served (no network request needed). If the cache is cold, `offline.html` is shown. |
| T21-09 | Try-again button | On the offline page, restore the network connection (disable Offline throttling) and click **Try again**. | The page reloads and returns to the app normally. |
| T21-10 | App icons present | Check DevTools → Application → Manifest. | All icon sizes (72 – 512 px) are listed and load without errors. A maskable icon is present for Android adaptive icons. |
| T21-11 | iOS Add to Home Screen | On an iPhone or iPad in Safari, tap Share → **Add to Home Screen**. | The OpReady icon (not the Safari default screenshot) appears on the home screen. Tapping it opens the app in standalone mode. |
| T21-12 | PWA Lighthouse audit | In Chrome DevTools → Lighthouse, run a **Progressive Web App** audit on the dashboard. | All PWA criteria pass (or near-pass — network-dependent checks may show as warnings in non-HTTPS environments). |
| T21-13 | Help content for PWA | Open System Tools page. Click the **?** help button. | The help modal includes a section titled *Install as App (PWA)* describing how to install on each platform. |
| T21-14 | Banner does not show on login | Open `/login.html` in a fresh browser session. | No install banner appears on the login page. |
| T21-15 | Banner hidden when already installed | Open the app from the installed PWA shortcut. | No install banner is shown (app is already installed, `display-mode: standalone` matches). |

---

## T22 — Knowledge Base

**Page:** `/knowledgebase.html` · **Access:** Admin and Superadmin

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T22-01 | Page loads | Log in as admin. Navigate to Knowledge Base from the System menu. | The page loads without errors. The left panel shows a category tree with an *All Documents* node. The right panel is empty with an *Upload PDF* button. |
| T22-02 | Add root category | Click **+ Add** in the Categories panel. Enter a name (e.g. *Operational*). Leave Parent as Root. Click **Save**. | The category appears in the tree. No parent indentation. |
| T22-03 | Add child category | Click **+ Add**. Enter a name (e.g. *Training*). Set Parent to *Operational*. Click **Save**. | *Training* appears indented under *Operational* in the tree. |
| T22-04 | Expand / collapse tree nodes | Click the chevron next to *Operational*. | Sub-categories expand and collapse. The chevron rotates accordingly. |
| T22-05 | Edit category | Hover over a category name. Click the pencil icon. Update the name and click **Save**. | The tree updates with the new name immediately. |
| T22-06 | Delete category with children | Create a parent with a child. Delete the parent via the trash icon. Confirm in the dialog. | The parent is removed. The child is re-parented (becomes a root category or moves to the parent's parent). No documents are deleted. |
| T22-07 | Select category filters documents | Click a category in the tree. | Only documents assigned to that category appear in the right panel. The panel title updates to the category name. |
| T22-08 | Select *All Documents* | Click the *All Documents* node. | All documents appear regardless of category. |
| T22-09 | Upload PDF | Click **Upload PDF**. Fill in title (*Fire Attack Procedures*), optional description, select a category, and attach a PDF file. Click **Save**. | A progress bar shows during upload. On completion, the document appears in the list with correct title, category, file size, and upload date. |
| T22-10 | Upload validation — no file | Click **Upload PDF**. Enter a title but do not attach a file. Click **Save**. | An error toast appears: *Please select a PDF file*. No upload occurs. |
| T22-11 | Upload validation — no title | Attach a PDF but leave the title blank. Click **Save**. | An error toast appears indicating the title is required. |
| T22-12 | Copy link | Click **Copy Link** on any document. | A success toast confirms the link was copied. Paste the URL into a new browser tab — the viewer page loads without login. |
| T22-13 | View document (admin) | Click **View** on a document. | A new tab opens showing the public viewer page for that document: branded header, title, description, and embedded PDF. |
| T22-14 | Edit document metadata | Click **Edit** on a document. Change the title and category. Click **Save**. | The document list updates with the new title and category. The slug and file are unchanged. |
| T22-15 | Toggle document inactive | Click the toggle switch on a document to disable it. | The toggle moves to the off state. Navigating to the document's public link returns a *Document Unavailable* page. Re-enabling the toggle restores access. |
| T22-16 | Delete document | Click **Delete** on a document. Confirm the action. | The document is removed from the list. The previous public link returns *Document Unavailable*. |
| T22-17 | Demo mode guard | In demo mode, attempt Upload, Edit, Delete, Toggle, and Category CRUD operations. | All destructive actions return a *Disabled in demo mode* error. |
| T22-18 | Public viewer — valid GUID | Open the public viewer URL (`/knowledgebase/<GUID>`) in an incognito window without logging in. | The page loads: branded header with app name, document title, description, category, file size, and the PDF embedded in the page. A Download button is visible. |
| T22-19 | Public viewer — invalid GUID | Navigate to `/knowledgebase/INVALID-GUID` without logging in. | The page loads showing *Document Unavailable* with a friendly message. No 500 error or stack trace. |
| T22-20 | Download PDF from viewer | On the public viewer, click **Download**. | The browser downloads the PDF file with the correct filename. |
| T22-21 | Mobile — category tree | Open Knowledge Base on a screen ≤ 768 px wide. | The category panel stacks above the document panel. The tree is still usable. |
| T22-22 | Mobile — document cards | View the document list on a narrow screen. | Documents render as cards (not a table). Each card shows title, category, size, date, active toggle, and action buttons. |
| T22-23 | Sort documents | Click a column header (e.g. *Uploaded*). | Documents sort by that column. Click again to reverse order. Sort direction indicator (▲/▼) updates. Preference is saved across page reloads. |
| T22-24 | Pagination | Upload more than 25 documents. | Pagination controls appear. First / Previous / Next / Last buttons work correctly. Rows-per-page selector is functional. |
| T22-25 | Help modal | Click the **?** button on the Knowledge Base page. | A help modal opens with sections covering Categories, Uploading, Sharing, and Managing Documents. |
| T22-26 | Event log entries | After performing Upload, Edit, Toggle, Delete, and Category CRUD operations, open the Event Log. | Each operation has a corresponding entry in the *Knowledge Base* category with a meaningful title and payload. |
| T22-27 | Upload auto-fill title from filename | Click **Upload Document**. Attach a file named `fire-attack_procedures.pdf`. Observe the Title field before typing anything. | The Title field is automatically pre-filled with *fire attack procedures* — hyphens and underscores are replaced with spaces and the extension is stripped. The field remains editable. |
| T22-28 | Missing file warning in Edit modal | Prerequisite: manually delete the physical file from storage while leaving the DB record intact. Open the Knowledge Base page and click **Edit** on that document. | The Edit modal opens with an amber warning banner stating the file is missing from storage. The Replace Document File section is visible with updated hint text. Clicking **Save** without selecting a replacement shows an error toast. Selecting a file and saving succeeds — the document is restored. |

---

## T23 — Backup & Restore

**Page:** `backup-restore.html`  
**Access:** Superadmin only

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T23-01 | Page load | Navigate to `backup-restore.html`. | Backup and Restore sections are both visible. Full Backup and Database Only download buttons are present. A file picker and Restore button are in the Restore section. |
| T23-02 | Download full backup | Click `[Full Backup]`. | A `.zip` file is downloaded. File size is non-zero. The archive contains `database.sql` and `manifest.json`. |
| T23-03 | Download database-only backup | Click `[Database Only]`. | A `.sql` file is downloaded. File size is non-zero. The file begins with valid SQL statements. |
| T23-04 | Restore button label updates on file selection | Click `[Choose Backup File]` and select a `.zip` file. | The submit button label changes to "Restore Full Backup". Repeat with a `.sql` file — label changes to "Restore Database". |
| T23-05 | Restore from SQL backup | Create a test member. Download a Database Only backup. Delete the test member. Click `[Choose Backup File]` → select the `.sql` file → click `[Restore Database]` → type `RESTORE` to confirm. | Application restores to the backed-up state. The test member reappears. Event log records "Database Restored". User is logged out and redirected to the login page after 5 seconds. |
| T23-06 | Restore from ZIP backup | Create a test member and upload a Knowledge Base document. Download a Full Backup. Delete the test member and the document. Restore from the `.zip` file → confirm with `RESTORE`. | Both the member and KB document are restored. Event log records "Database Restored". User is redirected to login after restore. |
| T23-07 | Restore requires keyword confirmation | Begin a restore with a selected file. When the confirmation prompt appears, enter a wrong keyword. | The confirm button remains disabled. The restore does not proceed until the exact keyword `RESTORE` is typed. |
| T23-08 | Demo mode blocks restore | On a demo-mode instance, select a backup file and click `[Restore]`. | Action is blocked with a toast: "Disabled in demo mode." No data is changed. |
| T23-09 | Back navigation | Click the back arrow (top-left). | User is returned to the Dashboard. |

### T23-C — Scheduled Backup

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T23-10 | Scheduled Backup section visible | Scroll to the Scheduled Backup section on `backup-restore.html`. | Section is visible with an Enable toggle, schedule options, backup type, save location, retention policy, and action buttons. |
| T23-11 | Ephemeral deployment warning | On a server with `DEPLOYMENT_TYPE=cloud-run`, open `backup-restore.html`. | A warning banner explains scheduled backups are unavailable. All form fields are disabled. |
| T23-12 | Save daily schedule | Toggle [Enable scheduled backups] to on. Select Frequency = "Once a day". Set time to 03:00. Select Database only. Enter a valid local path. Set retention to "Keep last 5 backups". Click [Save Schedule]. | Toast confirms "Schedule saved and activated." Status row shows the next scheduled run at the configured time. Event log records "Scheduled Backup Configured". |
| T23-13 | Save weekly schedule | Set Frequency = "Selected days of the week". Select Mon and Fri. Set time to 01:00. Click [Save Schedule]. | Config is saved. Next run date falls on the next Monday or Friday at 01:00. |
| T23-14 | Save every-N-hours schedule | Set Frequency = "Every N hours". Select 4 hours. Click [Save Schedule]. | Config saved. Next run is computed as the next 4-hour boundary from midnight. |
| T23-15 | Save every-N-days schedule | Set Frequency = "Every N days". Enter 2 days, time 22:00. Click [Save Schedule]. | Config saved. Note about month-boundary cron limitation is visible below the field. |
| T23-16 | Weekly — day selection required | Select Frequency = "Selected days of the week" but check no days. Click [Save Schedule]. | Toast warns "Select at least one day for weekly schedule." Nothing is saved. |
| T23-17 | Location required when enabled | Toggle enable to on but leave Save Location blank. Click [Save Schedule]. | Toast warns "Please enter a save location." Nothing is saved. |
| T23-18 | Run Now | Save a valid schedule. Click [Run Now] and confirm. | Toast confirms "Backup completed successfully." A new entry appears in the Recent Backup History table with status "Success" and a non-zero file size. |
| T23-19 | Run Now creates the file | After [Run Now], navigate to the configured save location on the server. | A backup file exists with the expected name pattern and is non-empty. |
| T23-20 | Retention cleanup | Run Now several times until history has more entries than the configured retention limit. | The oldest files in the save location are automatically deleted. The Cleaned column in the history row shows the count of deleted files. |
| T23-21 | Clear History | Click [Clear History] and confirm. | All entries disappear from the history table and mobile cards. Event log records "Scheduled Backup History Cleared". |
| T23-22 | Disable schedule | Toggle [Enable scheduled backups] to off. Click [Save Schedule]. | Toast confirms "Schedule disabled." Event log records "Scheduled Backup Disabled". No further automatic backups run. |
| T23-23 | Demo mode blocks Save and Run | On a demo-mode instance, try to save schedule or run now. | Both actions return a toast: "Disabled in demo mode." No changes made. |
| T23-24 | History — mobile cards | View the page on a screen ≤ 768 px with existing history entries. | History renders as cards (not a table). Each card shows Date/Time, Type, Filename, Size, Cleaned, and Status. |

---

## T24 — Remote Server Backup

**Page:** `backup-restore.html` → Remote Servers tab
**Access:** Superadmin only

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T24-01 | Remote Servers tab loads | Navigate to `backup-restore.html`. Click the [Remote Servers] tab. | Tab switches. Empty state message and [Add Server] button are visible. |
| T24-02 | Add server — validation | Click [Add Server]. Leave Name blank. Click [Save]. | Toast: "Name and URL are required." Nothing saved. |
| T24-03 | Add server — valid | Click [Add Server]. Fill in Name, URL, API Key, select DB type, enter save path. Click [Save]. | Server appears in the list. Event log records "Remote Backup Server Added". |
| T24-04 | Test connection — success | Click the edit icon on a server. Click [Test Connection]. | A green confirmation shows the remote OpReady version and uptime. |
| T24-05 | Test connection — failure | Click [Test Connection] with an incorrect URL or API key. | A red error message is shown. Nothing is saved. |
| T24-06 | Edit server — replace API key | Click edit icon. Click [Replace key]. Enter a new API key. Click [Save]. | Server is updated. API key is not visible after saving. |
| T24-07 | Edit server — no API key change | Click edit icon. Change Name only. Click [Save]. | Name is updated. Stored API key is unchanged. |
| T24-08 | Pull backup manually | Click the Play (▶) icon on a server. Select backup type. Click [Pull Backup]. | A success message shows the saved filename and file size. Entry appears in history. |
| T24-09 | Pull backup — remote unreachable | Click [Pull Backup] when the remote server is offline. | Error message shown. History entry records the error. |
| T24-10 | Configure scheduled pull | Click the Clock icon. Enable schedule. Set Frequency = Daily at 03:00. Click [Save Schedule]. | Schedule saved. Server row shows schedule label. Event log records "Remote Backup Schedule Set". |
| T24-11 | Disable scheduled pull | Open schedule modal. Toggle enable to off. Click [Save Schedule]. | Schedule disabled. Server row shows no schedule. Event log records "Remote Backup Schedule Disabled". |
| T24-12 | View pull history | Click the History icon on a server. | History modal opens showing a table of pull runs with date, type, triggered by, filename, size, and status. |
| T24-13 | Clear pull history | In the history modal, click [Clear]. Confirm. | History table clears. Event log records "Remote Backup History Cleared". |
| T24-14 | Delete server | Click the trash icon on a server. Confirm. | Server is removed from the list. Event log records "Remote Backup Server Deleted". History is deleted. No pulled backup files are deleted. |
| T24-15 | Max 5 servers limit | Add 5 servers. Try to click [Add Server] again. | [Add Server] button is disabled with tooltip explaining the 5-server limit. |
| T24-16 | Mobile cards | Open the Remote Servers tab on a mobile screen (≤ 768 px). | Servers render as cards with name, URL, type, schedule, last run, and all action buttons visible. |
| T24-17 | Demo mode guard | On a demo-mode instance, try Add, Edit, Pull, and Schedule actions. | All mutating actions show "Disabled in demo mode." toast. |

---

## T25 — API Management

**Page:** `api-management.html`  
**Access:** Admin and above

### T25-A — API Key Management

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T25-01 | Page load | Navigate to `api-management.html`. | Two sections are visible: "API Key Management" and "API Call Log". The key table loads (empty or with existing keys). |
| T25-02 | Create an API key — each role | Click `[+ Add API Key]` → enter Name, select Role = `superadmin` → click `[Create]`. Repeat for `admin`, `simple`, and `guest`. | For each: the full key (`osm_...`) is displayed once in a modal. Key appears in the list with the correct role badge. Event log records "API Key Created". |
| T25-03 | Copy the API key | Click `[Copy]` in the reveal modal. | Key is copied to the clipboard. Toast confirms. The full value is NOT shown again after closing. |
| T25-04 | Verify API key works | Use the copied `admin` key in a REST client: `GET /api/members` with header `X-API-Key: {key}`. | HTTP 200 response with member data. The call appears in the API Call Log after refreshing. |
| T25-05 | Revoke an API key | Click `[Revoke]` on an active key → confirm. | Key status changes to Revoked. Event log records "API Key Toggled" with `newState: disabled`. |
| T25-06 | Verify revoked key is rejected | Retry the API call from T25-04 with the now-revoked key. | HTTP 401 response. |
| T25-07 | Re-enable an API key | Click `[Enable]` on the revoked key → confirm. | Key status returns to Active. Event log records "API Key Toggled" with `newState: enabled`. |
| T25-08 | Delete an API key | Click `[Delete]` on a key → confirm. | Key is removed from the list. Event log records "API Key Deleted". Subsequent requests with that key return 401. |
| T25-09 | Sort API keys | Click the Name column header. | List sorts alphabetically. Icon shows ▲/▼ direction indicator. Preference persists on page reload. |
| T25-10 | Demo mode guard | On a demo instance, try Create, Revoke, and Delete. | All mutating operations show "Disabled in demo mode." toast. |

### T25-B — API Call Log

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T25-11 | Call log loads | Scroll to the API Call Log section. | Table shows logged entries (or "No entries found." if none yet). Columns: Timestamp, Key Name, Prefix, Method, Endpoint, Origin IP, User Agent, Status. |
| T25-12 | Endpoint includes query string | Make a REST call with query parameters: `GET /api/members?active=1&page=2` using an API key. Click `[Refresh]`. | The Endpoint column shows the full URL including query string: `/api/members?active=1&page=2`. |
| T25-13 | Filter by API key — active highlight | Open the Filters panel. Select a key from the "API Key" dropdown → click `[Apply]`. | Log shows only entries for that key. The "API Key" filter field has a blue border indicating it is active. |
| T25-14 | Filter by HTTP method | Select Method = `GET` → click `[Apply]`. | Only GET requests are shown. The "Method" filter field has a blue border. |
| T25-15 | Filter by endpoint text | Enter `/api/members` in "Endpoint contains" → click `[Apply]`. | Only entries whose endpoint path contains "/api/members" are shown. The "Endpoint" filter field has a blue border. |
| T25-16 | Filter by date range | Enter a From and To date → click `[Apply]`. | Only entries within the selected range are shown. Both date fields have a blue border. |
| T25-17 | Clear filters | Click `[Clear]`. | All filters are reset and blue borders are removed. Full unfiltered log is shown. |
| T25-18 | Rows per page — selector in pagination bar | Observe the pagination bar at the bottom of the call log. | A "Rows per page" dropdown is visible inside the pagination bar (not above it). Changing the value reloads the log with the new page size. |
| T25-19 | Purge old entries | Click `[Purge Old Entries]`. Enter `90` days → type `PURGE` → confirm. | Entries older than 90 days are deleted. Toast shows count deleted. Log refreshes. Event log records "API Call Log Purged". |
| T25-20 | Demo mode guard — purge | On a demo instance, click `[Purge Old Entries]`. | Toast shows "Disabled in demo mode." No entries deleted. |
| T25-21 | Sort by Timestamp | Click the Timestamp column header. | Log sorts by timestamp. Icon changes to ▲ or ▼. Click again to toggle direction. |
| T25-22 | Sort by Endpoint and Origin IP | Click the Endpoint column header, then the Origin IP column header. | Log re-sorts each time. Active column shows ▲/▼ icon; all other sortable columns show ⇅. |
| T25-23 | Sort preference persists on reload | Sort by Status (click the Status column header). Reload the page. | The call log reloads already sorted by Status in the same direction, without any user action. |
| T25-24 | Rows-per-page preference persists on reload | Change rows per page to 100. Reload the page. | The call log loads 100 rows per page automatically. The selector shows 100. |
| T25-25 | Params / Body detail — query params | Make a REST call with query parameters: `GET /api/members?active=1` using an API key. In the log, click the round action button (▶) on that row. | A detail panel expands below the row showing a "Query Params" block with `{ "active": "1" }`. |
| T25-26 | Params / Body detail — path params | Make a REST call with a path parameter: `GET /api/members/1` using an API key. Click the round action button on that row. | The detail panel shows a "Path Params" block with `{ "id": "1" }`. |
| T25-27 | Params / Body detail — request body | Make a `POST` call with a JSON body using an API key (e.g. create a member). Click the round action button on that log row. | The detail panel shows a "Request Body" block containing the sent fields. |
| T25-28 | Sensitive field masking | Make a call whose body or query string contains a field named `password` or `token`. Click the round action button on that row. | The value of the sensitive field is shown as `***` in the detail panel. The actual value is never stored. |
| T25-29 | No detail button when no params | Observe a log row for a plain `GET` with no query string, no path param, and no body (e.g. `GET /api/api-keys`). | No round action button appears on that row. |
| T25-30 | Download JSON includes params fields | Apply a filter and click `[Download JSON]`. Open the downloaded file. | Each record object contains `query_params`, `request_body`, and `path_params` fields (null when not applicable). |
| T25-31 | Geo-location — public IP | Make a REST API call from a routable public IP address using an API key (e.g. from a cloud VM). Click `[Refresh]`. Click the entry in the log. | The Origin IP cell shows the IP address with a small geo label beneath it (e.g. "Auckland, NZ"). The mobile card shows a "Location:" row. |
| T25-32 | Geo-location — private/local IP | Make a REST API call from localhost or a private network (e.g. `127.0.0.1`, `192.168.x.x`). Click `[Refresh]`. | The Origin IP cell shows the IP address. No geo label appears beneath it (private IPs resolve as null and produce no label). |

---

## T26 — Security Controls

This section verifies the security hardening applied in Round 3 (June 2026). All tests require a **superadmin** account unless a specific role is stated.

### T26-A — Session Timeout

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-01 | Session expires after 8 hours | Log in as any user. Note the login time. After 8 hours (or simulate by expiring the session cookie in DevTools), attempt to navigate to any authenticated page. | Redirected to the login page. The page does not load authenticated content. |
| T26-02 | No indefinite session | Log in and do not interact with the application for more than 8 hours. Return and refresh the page. | Session has expired. Login page is shown. |

### T26-B — Role Hierarchy Enforcement (User Management)

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-03 | Admin cannot edit another admin | Log in as an **admin** user. Navigate to `users.html`. Attempt to click `[Edit]` on another admin account. | Edit is blocked. Error toast: "Cannot modify a user at or above your own role level." No changes are saved. |
| T26-04 | Admin cannot edit superadmin | Log in as **admin**. Attempt to edit the superadmin account. | Same 403 error. No changes are saved. |
| T26-05 | Admin cannot promote user to admin | Log in as **admin**. Edit a simple user and change their Role to `admin`. Click `[Save]`. | Error: "Cannot assign a role higher than your own." The role is not updated. |
| T26-06 | Admin cannot promote user to superadmin | Log in as **admin**. Edit any user and set Role to `superadmin`. Click `[Save]`. | Same 403 error. The role is not updated. |
| T26-07 | Superadmin can edit admin | Log in as **superadmin**. Edit an admin account and change the name. Click `[Save]`. | Name updated successfully. Event log records the change. |
| T26-08 | Superadmin can change role to admin | Log in as **superadmin**. Edit a simple user and set Role to `admin`. Click `[Save]`. | Role updated successfully. |

### T26-C — GET /api/preferences Role Guard

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-09 | Unauthenticated access blocked | Log out of the application. In a REST client, call `GET {base-url}/api/preferences` with no credentials. | HTTP 401 Unauthorized. |
| T26-10 | Simple-role user blocked | Using an API key with `simple` role, call `GET /api/preferences`. | HTTP 403 Forbidden. |
| T26-11 | Admin can read preferences | Using an API key with `admin` role, call `GET /api/preferences`. | HTTP 200. JSON object with preference keys returned. |

### T26-D — Rate Limits (Sensitive Endpoints)

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-12 | Backup rate limit | Using a superadmin API key, call `GET /api/system/backup` 11 times in rapid succession. | The 11th call returns HTTP 429 with error message. Earlier calls return 200. |
| T26-13 | Restore rate limit | Using a superadmin API key, call `POST /api/system/restore` 4 times in rapid succession (with a valid SQL file each time). | The 4th call returns HTTP 429. Earlier calls proceed normally. |
| T26-14 | AI-test rate limit | Using a superadmin API key, call `POST /api/system/ai-test` 11 times within 60 seconds. | The 11th call returns HTTP 429. The window resets after 1 minute. |
| T26-15 | User creation rate limit | Using an admin API key, call `POST /api/users` 11 times within 15 minutes (use unique email addresses each time, then clean up). | The 11th call returns HTTP 429. |

### T26-E — Restricted Audit Log Categories

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-16 | Security category blocked | In a REST client with a valid session or API key, call `POST /api/logs` with body `{ "type": "Security", "title": "Test injection" }`. | HTTP 403 Forbidden. No log entry is created. |
| T26-17 | System category blocked | Repeat with `"type": "System"`. | HTTP 403 Forbidden. |
| T26-18 | User Mgmt category blocked | Repeat with `"type": "User Mgmt"`. | HTTP 403 Forbidden. |
| T26-19 | Application category allowed | Call `POST /api/logs` with `{ "type": "Members", "title": "Test entry" }`. | HTTP 200. Entry appears in the Event Log under category "Members". |

### T26-F — Knowledge Base Disk Space Guard

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-20 | Upload succeeds with sufficient disk space | On a server with more than 100 MB free, navigate to `knowledgebase.html` and upload a PDF. | Upload completes successfully. Document appears in the list. |
| T26-21 | Upload rejected when disk space is low | (Simulate or test on a near-full filesystem) Attempt to upload a document when server disk space is below 100 MB. | HTTP 507 response. Upload is rejected with an "Insufficient Storage" error message. No partial file is written. |

### T26-G — Content Security Policy

| ID | Action | Steps | Expected Result |
|----|--------|-------|----------------|
| T26-22 | CSP header present | Load any authenticated page and open DevTools → Network. Inspect the response headers for the HTML page. | `Content-Security-Policy` header is present with `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, and `connect-src 'self' ws: wss:`. |
| T26-23 | Clickjacking prevention | Attempt to embed any OpReady page in an `<iframe>` on a different origin. | Browser blocks the frame load due to `frame-ancestors 'none'`. |

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
| `API Keys` | Key Created, Key Toggled, Key Deleted, API Call Log Purged |
| `System` | Database Restored (if T23-05 or T23-06 was run), Events Pruned |
| `WhatsApp` | Client Connected, Client Disconnected |
| `Knowledge Base` | Category Created, Category Updated, Category Deleted, Document Uploaded, Document Updated, Document Toggled, Document Deleted |

All entries must include: a non-empty `actor` name, a timestamp, a meaningful `title`, and a populated `payload` object (never `{}`).

---

*Document version: see git history. Maintained as part of the OpReady developer skill — update this plan whenever a new page, feature, or operation is added, modified, or removed.*
