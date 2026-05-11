# AWS Lambda — OSM Dashboard Scraper

This Lambda function runs in the AWS `ap-southeast-6` (Auckland) region to scrape the geoblocked OpReady Dashboard and upload the raw HTML payload to a GCS bucket, where the OpReady reads it when running in `APP_MODE=gcs`.

See [Installation_google_run.md](../Installation_google_run.md) for the full Cloud Run deployment context.

---

## 1. Google Cloud Platform (GCP) Credentials & Bucket Setup

First, we need to create a secure pathway for our AWS Lambda to write to the GCP bucket.

* Create the Bucket: In the GCP Console, navigate to Cloud Storage and create your bucket (e.g., opready-dashboard-snapshots).
* Create a Service Account: Navigate to IAM & Admin > Service Accounts. Create a new service account specifically for this Lambda function.
* Assign Roles: Grant this service account the Storage Object Admin or Storage Object Creator role so it has permission to write files to the bucket.
* Generate JSON Key: Go to the "Keys" tab for the newly created service account, click "Add Key" -> "Create new key", and select JSON. Download this file. We will extract the project_id, client_email, and private_key from this JSON to use as environment variables in AWS.

## 2. AWS Lambda Configuration & Deployment

Because we require external dependencies (axios for scraping and @google-cloud/storage for GCP interaction), we cannot just paste code into the AWS console. We must create a deployment package.

* Local Project Setup: On your local machine, initialize a new Node.js project:
  Bash
  mkdir opready-scraper
  cd opready-scraper
  npm init -y
  npm install axios @google-cloud/storage
* Backend Logic (index.js): Create an index.js file with the following handler. Notice the .replace(/\\n/g, '\n') on the private key—this is a crucial step because AWS environment variables often escape newline characters, which will corrupt the GCP RSA key.
  JavaScript
   ```
  const axios = require('axios');
  const { Storage } = require('@google-cloud/storage');

  // Initialize GCP Storage using environment variables
  const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: {
  client_email: process.env.GCP_CLIENT_EMAIL,
  private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  });

  exports.handler = async (event) => {
  try {
  // Fetch external FENZ dashboard HTML
  // Note: Add authentication headers here if the DASHBOARD_URL requires them
  const response = await axios.get(process.env.DASHBOARD_URL);

 
      const bucket = storage.bucket(process.env.GCP_BUCKET_NAME);
      const fileName = process.env.GCP_FILE_NAME;

      // Stream the HTML payload to GCP
      await bucket.file(fileName).save(response.data, {
          contentType: 'text/html',
      });
        // GCP bucket for UAT environment (optional)
        if (process.env.GCP_BUCKET_NAME_UAT) {
            const bucket_uat = storage.bucket(process.env.GCP_BUCKET_NAME_UAT);
            await bucket_uat.file(fileName).save(response.data, {
                contentType: 'text/html',
            });
        }

      console.log(`Successfully saved ${fileName} to GCP.`);
      return { statusCode: 200, body: 'Snapshot archived successfully.' };
  } catch (error) {
      console.error('Lambda Execution Error:', error);
      return { statusCode: 500, body: 'Failed to execute scraper.' };
  }


  };
    ```
* Zip and Deploy: Zip the index.js file and the node_modules folder. In the AWS Console, create a new Lambda function (Node.js 20.x runtime) and upload this .zip file.
* Environment Variables: In the Lambda configuration tab, set up the following environment variables:
* DASHBOARD_URL (The external OSM dashboard URL)
* GCP_PROJECT_ID (From your GCP JSON key)
* GCP_CLIENT_EMAIL (From your GCP JSON key)
* GCP_PRIVATE_KEY (From your GCP JSON key - paste the exact string including \ns)
* GCP_BUCKET_NAME
* GCP_BUCKET_NAME_UAT // GCP bucket for UAT environment (optional)
* GCP_FILE_NAME

## 3. Amazon EventBridge Configuration (Scheduling)

To run this function hourly without relying on our Express.js server's internal timers:

* In the AWS Console, navigate to Amazon EventBridge > Rules.
* Click Create rule.
* Name the rule (e.g., Hourly-OSM-Scraper).
* Under Rule type, select Schedule.
* Choose A fine-grained schedule and enter the Cron expression: 0 * * * ? * (This triggers at the 0th minute of every hour).
* Under Targets, select AWS service -> Lambda function, and select the function you created in Step 2.
* Save the rule. EventBridge is now invoking your scraper hourly.


