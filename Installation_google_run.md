# Google Cloud Run Deployment Guide

Deploying the **OpReady** to Google Cloud Run requires specific configurations to handle both database persistence and geoblocked data retrieval.

## 1. The Persistence Challenge (Litestream)

Google Cloud Run is a **stateless** environment. Containers are ephemeral, meaning any local file changes (like our SQLite database `fenz.db`) are destroyed when the container restarts or scales down.

**The Solution:** We utilize **Litestream** as a sidecar process within the Docker container.

* As the Node.js application writes to`fenz.db`, Litestream asynchronously replicates the WAL (Write-Ahead Log) to a Google Cloud Storage (GCS) bucket.
* When a new container boots, Litestream intercepts the startup script (`start.sh`), downloads the latest snapshot from GCS, reconstructs the database, and*then* starts the Node.js server.

### ⚠️ Session Persistence Note

The application stores user sessions in a separate SQLite file (`sessions.db`) located alongside `fenz.db`. **Litestream only replicates `fenz.db`** — `sessions.db` is not included in the backup/restore cycle.

This means that on a cold container start (e.g., after a scale-to-zero event), all active user sessions are lost and users must log in again. Application data in `fenz.db` is fully preserved. This is expected behaviour for a stateless Cloud Run deployment and has no impact on data integrity.

### ⚠️ Real-Time Quiz Feature Requires `--max-instances=1`

The **Quiz Games** live-hosting feature (Timed quizzes, `quiz-host.html` / `quiz-play.html`) pushes state to the host and every joined player over a Socket.IO channel (`services/quiz-live-socket.js`). This channel keeps room membership and host/player presence **in that process's memory only** — there is no Redis (or other) adapter configured, and no session affinity is set up.

This means the feature **only works correctly with a single running instance**. If Cloud Run is ever allowed to scale beyond one instance (`--max-instances` raised above `1`, or the flag removed), a host and a player can land on two different instances that don't share any socket state:

* The host clicking **Start**, **Reveal**, or **Next Question** would never reach a player on a different instance — their screen just stops updating.
* The host's lobby "who has joined" indicator, and the host-disconnect banner shown to players, both rely on the same in-memory presence tracking and would misbehave the same way (e.g. a player could see a false "Host disconnected" banner simply because they landed on a different instance than the host).
* The underlying quiz data itself is **not** at risk — every mutation (start, answer, reveal, next, submit) goes through normal REST routes backed by `fenz.db`, which Litestream keeps consistent. A manual page reload always shows the correct, current state; the socket layer only carries the automatic "please refresh" push.

**As long as this deployment is kept at `--max-instances=1`, none of the above applies.** If horizontal scaling is ever needed for a much larger deployment, the Socket.IO layer would need a shared adapter (e.g. `@socket.io/redis-adapter`) and Cloud Run session affinity enabled first.

## 2. Architecture: Handling Geoblocking (The AWS Lambda Pattern)

The live OSM Dashboard is geoblocked to New Zealand IP addresses. If your Cloud Run service is deployed in a region outside of NZ, live scraping will fail.

To bypass this without complex proxy routing, the application supports a **Cloud Storage Payload Architecture**:

1. The Lambda function uploads this raw HTML file to your GCS Bucket.
2. An external worker (e.g., an AWS Lambda function running in the`ap-southeast-6` Auckland region) scrapes the live OSM Dashboard HTML.
3. The OpReady is configured with`APP_MODE=gcs`. Instead of making outbound HTTP requests to the live dashboard, the internal scraper service securely downloads and parses the HTML payload directly from the GCS bucket.
   More info at [AWS Lambda scraper Readme](AWS-Lambda-scraper\readme.md).

## 3. Preparation

### A. Create a Storage Bucket

Create a private Google Cloud Storage bucket (e.g., `opready-production-data`). This bucket will serve a dual purpose:

1. Storing the Litestream SQLite database backups.
2. Storing the`osm_dashboard_export.html` payload dropped by your AWS Lambda function.

### B. Configure IAM Permissions

Ensure the default Compute Service Account used by Cloud Run (or your custom service account) has the **Storage Object Admin** role for the bucket created above. This allows the application to read the HTML payload and Litestream to write database backups.

## 4. Environment Variables Reference

When deploying, you must configure the following environment variables:

### Core System & Security

* `DB_PATH`: Must be set to`/app/fenz.db` for Litestream to function correctly.
* `GCS_BUCKET_NAME`: The name of your storage bucket (e.g.,`opready-production-data`).
* `APP_USERNAME`: The master Super Admin username.
* `APP_PASSWORD`: A secure password for the Super Admin.
* `SESSION_SECRET`: A long, random cryptographic string for cookie signing.

### Operation Mode (GCS Payload via AWS Lambda)

* `APP_MODE`: Set to`gcs`.
* `GCS_DATA_FILENAME`: The name of the HTML file dropped by your Lambda function (e.g.,`osm_dashboard_export.html`).

### Operations Mode (Alternative: Live Scraping)

*If deploying in an NZ region or using a proxy:*

* `APP_MODE`: Set to`production`.
* `OSM_BU_ID`: Your unique Business Unit GUID for the dashboard.

### Application Behaviour (Optional but Recommended)

* `APP_TIMEZONE`: Timezone for date calculations (e.g., `Pacific/Auckland`). Defaults to NZ time.
* `APP_LOCALE`: Locale for date/time formatting (e.g., `en-NZ`).
* `APP_BASE_URL`: Public URL of the deployed app (e.g., `https://osm.station44.nz`). Required for valid form links.
* `TRAINING_DAY_OF_WEEK`: Brigade training day (e.g., `Monday`). Highlighted in the Training Planner.
* `ENABLE_WHATSAPP`: Set to `true` to enable the WhatsApp integration. See section 6 for resource requirements.
* `MAX_LOGIN_ATTEMPTS`: Failed login attempts before a user is blocked (default: `5`).

### UI Customization (Optional)

* `UI_LOGIN_TITLE`: Custom text for the login screen (e.g., "Station 44 OSM").
* `UI_LOGO_URL`: Public URL to a custom logo image.
* `UI_BACKGROUND_URL`: Public URL to a custom background image.

## 5. Deployment Command

Use the Google Cloud CLI to build and deploy the container. Execute this from the root of the project directory.

**Example `gcloud` Command (GCS Payload Architecture):**

```bash
gcloud run deploy OpReady \
  --source . \
  --region australia-southeast1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars DB_PATH=/app/fenz.db \
  --set-env-vars GCS_BUCKET_NAME=opready-production-data \
  --set-env-vars APP_MODE=gcs \
  --set-env-vars GCS_DATA_FILENAME=osm_dashboard_export.html \
  --set-env-vars APP_USERNAME=admin \
  --set-env-vars APP_PASSWORD=your_secure_password_here \
  --set-env-vars SESSION_SECRET=your_random_secret_string \
  --set-env-vars UI_LOGIN_TITLE="Station 44 OSM Manager"
```

`--max-instances 1` is required — see the Real-Time Quiz Feature note above, and the SQLite single-writer caveat inherent to the Litestream setup. Do not remove this flag without first adding a shared Socket.IO adapter.

## 6. Critical Resource Configuration (WhatsApp Support)

If you intend to enable the WhatsApp integration (ENABLE_WHATSAPP=true), the application launches a headless Chromium instance (via Puppeteer). **The default Cloud Run configuration (512MB RAM) will cause the application to crash immediately with out-of-memory errors.**

You **MUST** allocate sufficient resources to the container. We recommend updating your service with the following specifications:

```bash
gcloud run services update OpReady \
  --memory 2Gi \
  --cpu 1 \
  --execution-environment gen2 \
  --region australia-southeast1
```

Note: The **Second Generation (gen2)** execution environment is required to provide full file system compatibility for the headless browser.
