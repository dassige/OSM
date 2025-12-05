
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

#### 1\. Create a Storage Bucket (Database)

Create a private Google Cloud Storage bucket to hold your database backups.

  * **Example Name:** `osm-fenz-backups`
  * **Region:** Best to keep it in the same region as your Cloud Run service.

#### 2\. Configure Permissions

The Service Account your Cloud Run service uses needs permission to read and write to that bucket.

  * Go to **IAM & Admin**.
  * Find your service account (e.g., `12345-compute@developer.gserviceaccount.com`).
  * Grant it the role: **Storage Object Admin**.

#### 3\. Prepare Custom Branding (Optional)

If you want to customize the **Logo** or **Background** for this specific deployment:

1.  Upload your `logo.png` and `background.png` to a storage location (e.g., a public folder in your GCS bucket).
2.  Get the public URLs for these files (e.g., `https://storage.googleapis.com/my-bucket/logo.png`).
3.  You will pass these URLs as environment variables in the next step. The container will automatically download them on startup.

#### 4\. Deploy

You must set specific environment variables to link the app, Litestream, and your customization options.

  * `DB_PATH`: Must be set to `/app/fenz.db`.
  * `GCS_BUCKET_NAME`: The name of the bucket created in Step 1.
  * `UI_LOGIN_TITLE`: (Optional) The title text for the login screen.
  * `UI_LOGO_URL`: (Optional) URL to your custom logo.
  * `UI_BACKGROUND_URL`: (Optional) URL to your custom background.

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
  --set-env-vars DASHBOARD_URL="[https://www.dashboardlive.nz/index.php?user=YOUR_CODE](https://www.dashboardlive.nz/index.php?user=YOUR_CODE)" \
  --set-env-vars UI_LOGIN_TITLE="Station 44 OSM Manager" \
  --set-env-vars UI_LOGO_URL="[https://storage.googleapis.com/my-bucket/station44-logo.png](https://storage.googleapis.com/my-bucket/station44-logo.png)"
```
#### 5. Critical Resource Configuration (WhatsApp Support)

If you enable the WhatsApp integration (`ENABLE_WHATSAPP=true`), the application launches a headless Chrome instance. **The default Cloud Run settings (512MB RAM) are insufficient and will cause the application to crash immediately.**

You **MUST** update your service with the following minimum resources:

* **Memory:** At least **1GiB** (2GiB is highly recommended for stability).
* **CPU:** At least **1 CPU**.
* **Execution Environment:** Use **Second Generation** (gen2) for better file system compatibility.

**Update Command:**

```bash
gcloud run services update fenz-osm-manager \
  --memory 2Gi \
  --cpu 1 \
  --execution-environment gen2 \
  --region australia-southeast1