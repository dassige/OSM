
# Facebook Messenger Integration Guide

This application includes a feature to send **Expiring Skill Notifications** directly to members via Facebook Messenger. This document explains how the feature works, how to set it up, and how to use it effectively.

## 1. How It Works

The integration uses the **Official Meta (Facebook) Graph API**. Unlike WhatsApp (which uses a headless browser session), this is a standard API integration.

* **Page-Scoped IDs (PSID):** Facebook does not allow sending messages to phone numbers directly. Instead, every user has a unique ID specific to your Facebook Page.
* **Onboarding:** For the system to "know" a member's ID, the member must send a message to your Facebook Page *once*. This allows the system to capture their ID.
* **Notifications:** Once the ID is saved in the member's profile, the system can send automated skill reminders directly to their Messenger inbox.

## 2. Configuration & Setup

### Step 1: Meta (Facebook) Setup

You need to set up a Facebook Page and an App in the Meta Developers portal.

1.  **Create a Facebook Page:**
    * Go to Facebook and create a new Page for your brigade (e.g., "DVFB Training Bot").
    * This page will be the "sender" of the messages.

2.  **Create a Meta App:**
    * Go to [developers.facebook.com](https://developers.facebook.com).
    * Click **My Apps** > **Create App**.
    * Select **Other** > **Next**.
    * Select **Business** app type > **Next**.
    * Give it a name (e.g., "OSM Manager") and create it.

3.  **Setup Messenger Product:**
    * On the App Dashboard, scroll down to "Add products to your app".
    * Find **Messenger** and click **Set up**.
    * In the sidebar, go to **Messenger** > **API Setup**.
    * Scroll to **Access Tokens**.
    * Click **Add or Remove Pages** and select the Page you created in Step 1.
    * Authorize the permissions.
    * Once linked, click **Generate Token**.
    * **Copy this token.** This is your `MESSENGER_PAGE_ACCESS_TOKEN`.

### Step 2: Server Configuration

Add the token you generated to your `.env` file:

```bash
MESSENGER_PAGE_ACCESS_TOKEN=EAAG... (your long token here)
```

**Restart the application** for the changes to take effect.

### Step 3: Webhook Configuration (One-time)

To easily capture User IDs, you need to tell Facebook where your server is.

1.  Go back to the **Messenger** \> **Settings** page in the Meta Developer portal.
2.  Scroll to **Webhooks**.
3.  Click **Add Callback URL**.
4.  **Callback URL:** `https://your-cloud-run-url.run.app/webhook` (Must be HTTPS).
5.  **Verify Token:** Enter the value of your `SESSION_SECRET` from your `.env` file (or the specific verify token if you configured one).
6.  Click **Verify and Save**.
7.  Click **Add Subscriptions** next to your Page and select `messages`.

## 3\. Using the Feature

### Onboarding Members (Getting their ID)

Since you cannot send a message to a user until they message you first:

1.  Ask the volunteer to find your Page on Facebook (e.g., "DVFB Training Bot") and send a message saying "Hi".
2.  **Check your Server Logs** (in Google Cloud Console or Docker logs).
3.  You will see a log entry like this:
    ```text
    [MESSENGER] Message received from User!
    [MESSENGER] Content: "Hi"
    [MESSENGER] COPY THIS ID INTO MEMBER PROFILE: 1234567890123456
    ```
4.  Copy that numeric ID.
5.  Go to **Manage Members** in the OSM Manager.
6.  Edit the volunteer's profile and paste the ID into the **Messenger ID** field.
7.  Save.

### Sending Notifications

On the main **Dashboard**:

1.  **Bulk Sending:**

      * Check the **Messenger** checkbox in the table header (or individually for specific rows).
      * Click **"Send Notifications"**.

2.  **Quick Send:**

      * Click the round **Blue Messenger Icon** next to a member's row to immediately send a notification to that specific person.

*Note: If a member does not have a Messenger ID saved, the checkbox and button will be disabled.*
