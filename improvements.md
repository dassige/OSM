
# Future Improvements


### 1. User Experience (UX) Polish

**A. Native Dark Mode Support**
You already have a `styles.css`. Implementing a toggleable Dark Mode is a low-effort, high-impact visual upgrade.
* **Implementation:** Use CSS Custom Properties (Variables) for colors (e.g., `--bg-color`, `--text-color`).
* **Feature:** Add a toggle in the top-left Profile menu or next to the logout button. Persist the preference in `localStorage` so it remains after a refresh.

**B. "Toast" Notifications instead of `alert()`**
Currently, the app relies heavily on `alert()` and `confirm()`. These block the UI and look dated.
* **Improvement:** Replace `alert()` with non-blocking "Toast" notifications (little popups in the corner) for success/error messages (e.g., "Email Sent", "User Created").
* **Library:** [Toastify.js](https://github.com/apvarun/toastify-js) is lightweight and no-dependency, fitting your "vanilla" theme.

**C. Mobile "Card View"**
The `<table>` layouts are difficult to read on mobile phones.
* **Improvement:** Use a CSS Media Query (`@media (max-width: 600px)`) to transform table rows into "Cards" where each cell becomes a key/value pair stacked vertically. This makes the "Expiring Skills Report" readable for officers checking on their phone in a truck.

### 2. Functional Improvements

**A. Automated Scheduler (Cron)**
This is mentioned in your `improvements.md` and is the logical next step.
* **Concept:** Instead of manually clicking "Reload" and "Send", allow Admins to set a schedule (e.g., "Every Monday at 09:00").
* **Implementation:**
    1.  Install `node-cron`.
    2.  Add a UI in "System Tools" to configure the Cron String (or simple dropdowns) and select the target channel (Email/WhatsApp).
    3.  When the cron fires, reuse the logic in `main.js` (specifically `processOIData`) to scrape and send silently.
    4.  Log the output to the database `event_log` so admins can check it later.

**B. Analytics Dashboard**
The current dashboard is purely tabular. Visuals help quick decision-making.
* **Feature:** Add a "Statistics" row above the table using [Chart.js](https://www.chartjs.org/).
* **Metrics to show:**
    * **Compliance Rate:** (Total Active Members - Members with Expiring Skills) / Total Members.
    * **Critical vs Non-Critical:** Pie chart of expiring skills.
    * **Upcoming Workload:** Bar chart showing number of expirations per month for the next 6 months.

**C. WhatsApp "Reply" Forwarding**
Currently, `whatsapp-service.js` sends messages but ignores replies.
* **Scenario:** A member replies to the bot saying "I did this yesterday!" or "The form link is broken."
* **Improvement:** Listen for the `message` event in `whatsapp-web.js`. When a message is received from a known Member number:
    1.  Log it to the `event_log` or `email_history`.
    2.  (Optional) Forward that message to the Super Admin via Email or WhatsApp so it isn't lost in the bot's session.

**D. Messenger integration**: in addition to send emails and whatsapp messages, the user will be able to send messages to Facebook Messenger - ON HOLD until I understand more on the Meta Graph APIs

### 3. Architectural & Security Enhancements

**A. Two-Factor Authentication (2FA)**
Since the app manages personal contact details, adding 2FA is a great security feature.
* **Implementation:** Use the `speakeasy` (for token generation) and `qrcode` (for display) libraries.
* **Flow:** When a user logs in, ask for a 6-digit code. Store the 2FA secret in the `users` table (you'd need a migration column).

**B. Smart "Magic Links" for Acknowledgement**
Currently, you send a link to a Google Form.
* **Improvement:** Send a link back to your app: `https://your-app.com/ack?token=xyz`.
* **Function:** When the user clicks this link, it marks the skill as "Acknowledgement Received" in a new database table. This lets you track *who* is actually reading the reminders, even if the OSM dashboard hasn't updated yet.

**C. Database Migration System**
You are currently handling DB schema changes with `try { await db.exec(...) } catch` blocks inside `initDB`. As the app grows, this becomes risky.
* **Improvement:** Implement a simple migration system (e.g., `sqlite-migrate` or a custom file-based runner).
* **Benefit:** Ensures that if you add columns for 2FA or Scheduling, the database updates reliably across different deployments (Local vs Cloud Run).

### Recommended Roadmap

1.  **Immediate (High Value / Low Effort):** Implement **Toast Notifications** and **Mobile Card View CSS**.
2.  **Short Term:** Implement the **Automated Scheduler** (node-cron). This moves the app from a "tool" to an "automation platform."
3.  **Long Term:** Add **Analytics** and **2FA**.

Would you like to see a code example for any specific one of these ideas?