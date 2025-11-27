Based on the current codebase, here is a suggested `improvement.md` file outlining potential future enhancements for the FENZ OSM application.

***

# Future Improvements

## 1. Security & Configuration
- **Environment Variables**: Currently, configuration lies in `resources.js`. Moving sensitive data (SMTP credentials, User Codes) to a `.env` file using `dotenv` would improve security and make container configuration easier.
- **TLS Verification**: The axios request in `main.js` currently uses `rejectUnauthorized: false`. This bypasses SSL security checks. Resolving the underlying certificate issue and enabling verification is recommended for production security.
- **Web Interface Authentication**: The dashboard at `public/index.html` is open. Adding Basic Auth or a simple login mechanism (e.g., Passport.js) would prevent unauthorized users from triggering emails.

## 2. Architecture & Performance
- **Remove Child Processes**: `server.js` currently uses `spawn` to run `main.js` as a separate shell command. This is resource-heavy and hard to debug.
    - *Improvement*: Refactor `main.js` to export its functions (e.g., `getOIData`, `processOIData`) and call them directly from `server.js` as asynchronous functions.
- **Modularization**: `main.js` currently handles scraping, business logic, and emailing.
    - *Improvement*: Split into dedicated services:
        - `services/scraper.js`: Handles Axios/Cheerio logic.
        - `services/mailer.js`: Handles Nodemailer logic.
        - `services/member-manager.js`: Handles member filtering and expiry logic.
- **Logging**: Replace `console.log` with a structured logger like `winston` or `pino` to better handle logs in Docker/Production environments.

## 3. Frontend Enhancements
- **Separate Assets**: Extract CSS and JavaScript from `index.html` into `public/styles.css` and `public/app.js` for better maintainability.
- **Modern Framework**: If complexity grows, migrating the vanilla HTML/JS to a lightweight framework like Vue.js or React would make state management (handling the `skillsTable` and socket events) cleaner.
- **Loading Indicators**: Replace the text-based log with a visual progress bar or spinner on the UI when fetching data.

## 4. Reliability & Testing
- **Unit Tests**: Add a testing framework (Jest or Mocha).
    - Test the `checkExpiringSkills` logic to ensure date math is always correct.
    - Mock the scraper to test parser logic without hitting the live dashboard.
- **Scraper Resilience**: The `cheerio` selectors in `getOIData` rely on specific table structures (`$('tbody')` -> `find('tr')`). If the external dashboard updates its layout, this will break. Adding validation steps to ensure the scraped data looks "correct" before processing would prevent silent failures.

## 5. New Features
- **Database Integration**: Currently, data is fetched live every time. Adding a lightweight DB (SQLite or a JSON file db) could allow:
    - History tracking (Who was emailed and when).
    - caching dashboard data to reduce external requests.
- **Scheduled Automation**: Instead of requiring a manual button press, integrate a scheduler (like `node-cron`) to automatically check and send emails on a weekly/monthly basis.
- **Email Templating**: Move the hardcoded HTML strings in `sendMessage` to a template engine (EJS or Handlebars) to allow for easier design changes without touching code.