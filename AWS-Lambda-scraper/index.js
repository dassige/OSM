const axios = require('axios');
const { Storage } = require('@google-cloud/storage');

// Initialize GCP Storage using environment variables
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: {
    client_email: process.env.GCP_CLIENT_EMAIL,
    // Replaces escaped newlines AND strips any accidental double quotes
    private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, ''),
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

        console.log(`Successfully saved ${fileName} to GCP.`);
        return { statusCode: 200, body: 'Snapshot archived successfully.' };
    } catch (error) {
        console.error('Lambda Execution Error:', error);
        return { statusCode: 500, body: 'Failed to execute scraper.' };
    }
};
