Here is a comprehensive `README.md` generated based on the source code you provided.

-----

# FENZ OSM Automation Manager

 *[Add other badges here, e.g., build status, version]*

## Description

**FENZ OSM Automation Manager** is a Node.js-based tool designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills for specific team members. The system scrapes competency data, identifies skills expiring within a user-defined threshold (default 30 days), and generates a report. Administrators can then use the web interface to send targeted email notifications to members, providing them with direct links (e.g., Google Forms) to complete their specific skill renewals.

**Key Features:**

  * **Dashboard Scraping:** Fetches real-time skill data from an OSM dashboard URL.
  * **Web Interface:** A user-friendly console to view expiring skills and control email operations.
  * **Automated Emailing:** Sends reminders via SMTP (e.g., Gmail) containing deep links to specific renewal forms.
  * **Configurable Thresholds:** Adjust the "days to expiry" setting directly from the UI.
  * **Dockerized:** Ready for deployment using Docker and Docker Compose.

## Table of Contents

  * [Installation](https://www.google.com/search?q=%23installation)
  * [Configuration](https://www.google.com/search?q=%23configuration)
  * [Usage](https://www.google.com/search?q=%23usage)
  * [Docker Deployment](https://www.google.com/search?q=%23docker-deployment)
  * [Project Structure](https://www.google.com/search?q=%23project-structure)
  * [Contributing](https://www.google.com/search?q=%23contributing)
  * [Troubleshooting](https://www.google.com/search?q=%23troubleshooting)
  * [License](https://www.google.com/search?q=%23license)
  * [Authors and Acknowledgments](https://www.google.com/search?q=%23authors-and-acknowledgments)

## Installation

### Prerequisites

  * Node.js (v20 or higher recommended)
  * npm (Node Package Manager)

### Steps

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/fenz-osm-manager.git
    cd fenz-osm-manager
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Setup Configuration:**
    The project relies on a `resources.js` file which is git-ignored for security. You must create this file from the example.

    ```bash
    cp resources.example.js resources.js
    ```

## Configuration

Open `resources.js` and configure the following sections:

1.  **Members List:**
    Define the team members you want to track.

    ```javascript
    const members = [
      { "name": "John Doe", "email": "john@example.com", "skills": [] },
      // ...
    ];
    ```

2.  **Skill URLs:**
    Map skill names (as they appear in the dashboard) to their corresponding renewal form URLs.

    ```javascript
    const skillUrls = [
        { "name": "OI (IS1) - Operational Safety", "url": "https://forms.google.com/..." },
        // ...
    ];
    ```

3.  **Dashboard URL:**
    The URL where the script scrapes data from.

    ```javascript
    const url = 'https://www.dashboardlive.nz/index.php?user=YOUR_CODE';
    ```

4.  **Email Settings (SMTP):**
    Configure your email provider. If using Gmail, you may need an [App Password](https://support.google.com/accounts/answer/185833).

    ```javascript
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'sender@yourdomain.com',
            pass: 'your-app-password'
        }
    });
    ```

## Usage

### Running Locally

To start the application server:

```bash
npm start
```

Access the web interface at: `http://localhost:3000`

### Web Interface Workflow

1.  **Set Threshold:** Enter the number of days (e.g., 30) in the "Days to Expiry" box.
2.  **View Skills:** Click **"View Expiring Skills"**. The terminal will show the scraping progress, and a table will populate with members who have skills expiring soon.
3.  **Select Members:** Use the checkboxes in the table to select who should receive an email.
4.  **Send Emails:** Click **"Send Emails"** to dispatch notifications.

### CLI Usage (Advanced)

While the Web UI is the primary method, `main.js` can be run directly:

  * **Test Mode (No emails sent):** `node main.js test`
  * **View Only:** `node main.js view 30` (where 30 is the day threshold)

## Docker Deployment

This project includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

1.  **Build and Run:**
    ```bash
    docker-compose up -d --build
    ```
2.  **Access:**
    Open `http://localhost:3000` in your browser.

*Note: The `docker-compose.yml` mounts `resources.js` as a volume, so changes to your config file apply immediately upon restarting the container.*

## Project Structure

  * **`server.js`**: The Express/Socket.io backend that handles UI requests and spawns the worker process.
  * **`main.js`**: The worker script. Handles scraping (Axios/Cheerio), logic, and emailing (Nodemailer).
  * **`public/index.html`**: The front-end dashboard.
  * **`resources.js`**: (Ignored) Configuration for members, URLs, and secrets.
  * **`resources.example.js`**: Template for configuration.

## Contributing

Contributions are welcome\! Please follow these steps:

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## Troubleshooting

  * **Login Error / Email Failures:**
      * Ensure your SMTP credentials in `resources.js` are correct.
      * If using Gmail, ensure 2FA is enabled and you are using an **App Password**, not your main password.
  * **No Data Retrieved:**
      * Check that the `url` in `resources.js` is accessible and active.
      * Verify if the dashboard HTML structure has changed, as this may break the `cheerio` selectors in `main.js`.
  * **Docker Changes Not Reflecting:**
      * If you changed `package.json`, you need to rebuild: `docker-compose up -d --build`.

## Changelog

  * **v1.0.0**: Initial Release. Basic scraping, viewing, and emailing functionality.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Authors and Acknowledgments

  * **[Your Name/Handle]** - *Initial work*
  * **[Contributor Name]** - *[Contribution]*

*Acknowledgments:*

  * Built with [Node.js](https://nodejs.org/)
  * [Socket.io](https://socket.io/) for real-time communication
  * [Cheerio](https://cheerio.js.org/) for HTML parsing
