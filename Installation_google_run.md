
## Google Cloud Run Deployment

### ⚠️ The Persistence Challenge

Google Cloud Run is a **stateless** environment. This means the containers are ephemeral—they can be shut down or restarted by Google at any time. When a container stops, **any files written to its local filesystem are deleted**.

Since this application uses **SQLite** (which stores data in a local file, `fenz.db`), a standard Cloud Run deployment would wipe your database every time the app updates or restarts.

### ✅ The Solution: Litestream

To fix this without rewriting the application code, we use a tool called **Litestream**.

1.  **Backup:** As your app writes to `fenz.db`, Litestream continuously replicates those changes to a **Google Cloud Storage (GCS)** bucket in the background.
2.  **Restore:** When a new Cloud Run container starts, Litestream automatically downloads the latest database from GCS *before* your Node.js application starts.

### Deployment Guide

Follow these steps to deploy securely with persistence.

#### 1\. Create a Storage Bucket

Create a private Google Cloud Storage bucket to hold your database backups.

  * **Example Name:** `osm-fenz-backups`
  * **Region:** Best to keep it in the same region as your Cloud Run service (e.g., `australia-southeast1`).

#### 2\. Configure Permissions

The Service Account your Cloud Run service uses (usually the *Compute Engine default service account*) needs permission to read and write to that bucket.

  * Go to **IAM & Admin**.
  * Find your service account (e.g., `12345-compute@developer.gserviceaccount.com`).
  * Grant it the role: **Storage Object Admin**.

#### 3\. Deploy

You must set two specific environment variables to link the app, Litestream, and your bucket.

  * `DB_PATH`: Must be set to `/app/fenz.db` (This aligns the app with Litestream's configuration).
  * `GCS_BUCKET_NAME`: The name of the bucket you created in Step 1.

**Example `gcloud` Command:**

```bash
gcloud run deploy fenz-osm-manager \
  --source . \
  --region australia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars DB_PATH=/app/fenz.db \
  --set-env-vars GCS_BUCKET_NAME=osm-fenz-backups \
  --set-env-vars APP_USERNAME=admin \
  --set-env-vars APP_PASSWORD=your_secure_password \
  --set-env-vars SESSION_SECRET=change_this_to_something_random \
  --set-env-vars DASHBOARD_URL="https://www.dashboardlive.nz/index.php?user=YOUR_CODE"
```

*Note: You can also configure these environment variables via the Google Cloud Console UI under the "Variables & Secrets" tab during deployment.*