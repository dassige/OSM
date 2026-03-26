# Windows 11 Desktop Build Guide

This guide covers how to package the **FENZ OSM Manager** as a standalone native Windows 11 application (`.exe`) using the Electron framework.

## 1. Prerequisites
* **Node.js**: v20 or higher.
* **Windows 10/11**: Required for building the `.exe` with native icon support.
* **Dependencies**: Ensure all Electron-related dependencies are installed:
  ```bash
  npm install
  ```

## 2\. Development & Testing

Before building the installer, you can run the application in a native shell to verify the **Windows 11 UI** and **Desktop Notifications**:

```bash
npm run electron:dev
```

*Note: This launches the application using `electron-main.js` and connects to the internal Express server on port 3000.*

## 3\. Production Build

To generate the final installable Windows package (run this command in Windows console as Administrator):

```bash
npm run electron:build
```

### Build Artifacts

Once completed, the installer will be available in the following directory:

  * **Output Path**: `dist-electron/`
  * **File Name**: `FENZ OSM Manager Setup [version].exe`

## 4\. Key Desktop Features

  * **Persistence**: Unlike the web version which uses the project root, the Windows app stores `fenz.db` and WhatsApp session data in `%APPDATA%/fenz-osm/`.
  * **Native Notifications**: Critical skill expiry alerts are pushed directly to the Windows 11 Action Center.
  * **Default Browser Integration**: Links to external forms or the FENZ Portal open in your system's default browser (e.g., Chrome or Edge) instead of the app shell.

## 5\. Deployment Notes

The generated installer is a standard **NSIS** package. It allows the user to:

  * Choose a custom installation directory.
  * Create a desktop shortcut.
  * Uninstall safely via Windows Settings.

<!-- end list -->

