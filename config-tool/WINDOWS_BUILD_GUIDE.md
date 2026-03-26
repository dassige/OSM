# Initialize System Settings (The Configurator)

Since the packaged Windows application cannot rely on a `.env` file in the installation directory, you must use the **FENZ OSM Configurator** tool to set up your environment variables.

## Build the Configurator
1. Navigate to the configurator directory:
   ```bash
   cd config-tool
   ```
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Run the generated `.exe` from `config-tool/dist-electron/`.

## Configuration Workflow
Use the Configurator to set the following critical variables:
* **Application Access**: Admin/Demo credentials and the custom login title.
* **OSM & Scraping**: Your Business Unit GUID and the scraping frequency.
* **Communication**: SMTP credentials and WhatsApp status.

**Note:** These settings are stored securely in your user profile (`%APPDATA%\fenz-osm\settings.json`) and will persist across application updates.
