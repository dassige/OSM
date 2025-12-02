
# Future Improvements

## 1. Security & Configuration

- **TLS Verification**: The axios request in `main.js` currently uses `rejectUnauthorized: false`. This bypasses SSL security checks. Resolving the underlying certificate issue and enabling verification is recommended for production security.

## 2. Architecture & Performance

- **Logging**: Replace `console.log` with a structured logger like `winston` or `pino` to better handle logs in Docker/Production environments.

## 3. Frontend Enhancements

- **Online Help**:

- **Modern Framework**: If complexity grows, migrating the vanilla HTML/JS to a lightweight framework like Vue.js or React would make state management (handling the `skillsTable` and socket events) cleaner.


## 4. Reliability & Testing
- **Unit Tests**: Add a testing framework (Jest or Mocha).
    - Test the `checkExpiringSkills` logic to ensure date math is always correct.
    - Mock the scraper to test parser logic without hitting the live dashboard.

## 5. New Features

- **Scheduled Automation**: Instead of requiring a manual button press, integrate a scheduler (like `node-cron`) to automatically check and send emails on a weekly/monthly basis.

- **Whatsapp and Messenger integration**: in addition to send emails, the user will be able to send whatsapp messages to mobiles or messages to Facebook Messenger


