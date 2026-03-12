
# AWS Deployment & Persistence Guide (Auckland Region)

## ⚠️ The Persistence Challenge

AWS App Runner is a **stateless** environment. This means the container's local filesystem is ephemeral; any files written to it, such as the `fenz.db` SQLite database, are deleted whenever the service updates or restarts.

### ✅ The Solution: Litestream

To enable persistence without a costly managed database, we use **Litestream**:

1. **Backup:** It continuously replicates changes from the local `fenz.db` to an **Amazon S3** bucket in the background.
2. **Restore:** When a new App Runner instance starts, the system automatically downloads the latest database snapshot from S3 before the Node.js application begins.

---

## 1. Infrastructure Setup

### Create the S3 Storage Bucket

This bucket will store your database replicas.

1. Log in to the **AWS Management Console**.
2. Navigate to **S3** and click **Create bucket**.
3. **Bucket Name:** e.g., `fenz-osm-backups-nz` (must be unique).
4. **Region:** Select **Auckland (ap-southeast-3)**.
5. Keep **Block all public access** enabled.
6. Click **Create bucket**.

### Configure IAM Permissions

App Runner needs permission to read and write to your S3 bucket.

1. Navigate to **IAM > Roles** and click **Create role**.
2. **Trusted entity type:** Select **AWS Service**.
3. **Service or use case:** Choose **App Runner**.
4. **Select your use case:** Choose **App Runner Requests** (this creates an **Instance Role**).
5. Click **Next**. On the permissions page, click **Create policy**.
6. Switch to the **JSON** tab and paste the following (replace `your-bucket-name` with your actual bucket name):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}

```

7. Name the policy `FenzOsmS3Access` and click **Create policy**.
8. Go back to the role creation tab, refresh the policies, select `FenzOsmS3Access`, and finish creating the role (e.g., `FenzOsmAppRunnerRole`).

---

## 2. Prepare Custom Branding (Optional)

To use a custom logo or background in the Auckland deployment:

1. Upload your `logo.png` and `background.png` to a location (like another folder in your S3 bucket).
2. Obtain the URLs for these files.
3. These will be passed as environment variables in the next step to be downloaded automatically on startup.

---

## 3. Deploy to AWS App Runner

### Service Configuration

1. Navigate to **AWS App Runner** and click **Create service**.
2. **Source:** Select **Source code repository** and connect your GitHub account.
3. **Repository:** Select `dassige/OSM` and the `main` branch.
4. **Deployment Settings:** Select **Automatic** to deploy on every push.

### Configure Build & Runtime

* **Runtime:** Node.js 20.
* **Build Command:** `npm install`.
* **Start Command:** `./start.sh`.
* **Port:** 3000.

### Environment Variables

Add the following variables to link the app, Litestream, and customizations:

* `APP_MODE`: `production`
* `DB_PATH`: `/app/fenz.db`
* `REPLICA_URL`: `s3://your-bucket-name/fenz.db`
* `UI_LOGIN_TITLE`: e.g., "Station 12 OSM Manager"
* `UI_LOGO_URL`: (Optional) URL to your custom logo
* `UI_BACKGROUND_URL`: (Optional) URL to your custom background

### Critical Resource Configuration

If enabling WhatsApp integration (`ENABLE_WHATSAPP=true`), the headless Chrome instance requires significant resources.

* **CPU:** 1 vCPU.
* **Memory:** At least **2 GB** (High memory is required to prevent the application from crashing during Chrome startup).

### Security (IAM Role)

Under the **Security** section, select the **Instance Role** you created earlier (`FenzOsmAppRunnerRole`). This allows Litestream to authenticate with S3.

---

## 4. Custom Domain Mapping (e.g. GoDaddy)

1. In the App Runner console, select your service and go to the **Custom Domains** tab.
2. Click **Add domain** and enter your domain (e.g., `osm.brigade.nz`).
3. AWS will generate three **CNAME records**.
4. Log in to your **Domain provider DNS Management** panel and add these three records.
5. **SSL/TLS Provisioning:** AWS will automatically verify the records and issue an HTTPS certificate. This usually takes **30–60 minutes** to complete.

