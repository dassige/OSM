
# WhatsApp Integration Guide

This application includes a feature to send **Expiring Skill Notifications** directly to members via WhatsApp. This document explains how the feature works, how to set it up, and how to use it effectively.

## 1. How It Works (Technical Context)

The integration relies on a library called **`whatsapp-web.js`**. Unlike the official WhatsApp Business API, which is paid and requires Meta verification, this library works by running a "Headless" version of WhatsApp Web on the server.

* **Headless Browser:** The server launches a hidden Google Chrome instance (via Puppeteer).
* **Automation:** It navigates to `web.whatsapp.com` internally and acts exactly like a real user sitting at a computer.
* **Authentication:** It generates a QR code that you scan with your physical phone. This links the server session to your WhatsApp account.
* **Session Persistence:** Once linked, the session tokens are saved locally in the `.wwebjs_auth` folder, allowing the server to stay connected even after restarts.

> **Note:** Because this relies on your physical phone's connection, your phone must have an active internet connection for the server to send messages.

## 2. Configuration & Setup

### Step 1: Enable the Feature
Ensure the feature is enabled in your `.env` file:
```bash
ENABLE_WHATSAPP=true
```
### Deployment Requirements (Cloud Run / Docker)

Since this feature runs a full browser instance in the background, your container requires more resources than a standard Node.js app.

* **Google Cloud Run:** You must allocate at least **1GiB of RAM** (2GiB recommended) and **1 CPU**. The default 512MB will cause the service to crash with a `TimeoutError` or `ProtocolError` upon startup.
* **Docker:** No specific limits are enforced by default, but ensure your host has available memory. The system automatically applies the necessary `--disable-dev-shm-usage` flags for Docker compatibility.

### Step 2: Access the Management Panel

Log in as a **Super Admin** or **Admin** and navigate to the **Third Party Services** page via the main menu.

### Step 3: Connect a Session

1.  Click the **Start Service** button. The server will launch the hidden browser.
2.  Wait for a **QR Code** to appear on the screen.
3.  Open WhatsApp on your mobile phone:
      * **Android:** Three dots \> Linked devices \> Link a device.
      * **iOS:** Settings \> Linked Devices \> Link a Device.
4.  Scan the QR code displayed on the screen.
5.  Once successful, the status will turn **Green (Connected)** and display your account name and number.

## 3\. Using the Feature

### Sending Test Messages

On the **Third Party Services** page, once connected, the "Test Integration" button becomes active. Use this to send a custom message to any number (e.g., your own) to verify that the system can send messages successfully.

### Sending Skill Notifications (Dashboard)

On the main **Dashboard**, you will see a new **WhatsApp** column in the "Expiring Skills List" table.

  * **Bulk Sending:**

    1.  Check the **WhatsApp** checkbox for the members you wish to notify.
    2.  (Optional) You can select both Email and WhatsApp to send to both channels simultaneously.
    3.  Click **"Send Notifications"**.

  * **Quick Send (Single User):**

      * Click the round **Green Phone Icon** next to a member's row to immediately send a WhatsApp notification to that specific person.

  * **Eligibility:**

      * The checkbox and button will be **disabled** (grayed out) if the member does not have a mobile number configured in the database.

## 4\. Preferences: Auto-Disconnect

In the **Third Party Services** page, you can enable **"Auto-disconnect on Logout"**.

  * **What it does:** If enabled, when you log out of the FENZ OSM web app, the server will automatically destroy the WhatsApp session.
  * **Why use it?** This is a security feature. If multiple admins share the system, this ensures your personal WhatsApp account doesn't stay linked to the server when you are not using it.
  * **Trade-off:** You will need to re-scan the QR code every time you log back in to use WhatsApp features.

## 5\. Troubleshooting

  * **"Protocol Error / Target Closed":** This usually happens if the server restarts while the browser is busy. Simply click "Start Service" again.
  * **QR Code Not Loading:** If the QR code doesn't appear within 30 seconds, try refreshing the page. If the issue persists, check the server console logs.
  * **Messages Not Sending:** Ensure your physical phone has an internet connection. If the phone is off or in airplane mode, messages will remain "queued" until the phone reconnects.

<!-- end list -->

