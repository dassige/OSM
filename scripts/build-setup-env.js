#!/usr/bin/env node
/**
 * build-setup-env.js — Packages setup-env.js into a Windows .exe and writes
 * a companion instructions .txt file to dist/.
 *
 * Usage:
 *   npm run build:setup-env
 *   node scripts/build-setup-env.js
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const { version } = require(path.join(ROOT, 'package.json'));
const baseName = `setup-env-${version}`;
const distDir  = path.join(ROOT, 'dist');
const exePath  = path.join(distDir, `${baseName}.exe`);
const txtPath  = path.join(distDir, `${baseName}.txt`);

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

console.log(`\n> Building ${baseName}.exe …`);
execSync(
    `pkg scripts/setup-env.js --targets node18-win-x64 --output "${exePath}"`,
    { stdio: 'inherit', cwd: ROOT }
);

const instructions = `\
OpReady - Environment Setup Tool v${version}
${'='.repeat(44)}

WHAT IT DOES
------------
Opens a web UI at http://localhost:3088 that lets you configure all
OpReady environment variables. On submit it writes a .generated.env
file ready to be copied to .env.

QUICK START
-----------
1. Copy ${baseName}.exe to the folder that contains .example.env
   (typically the project root).

2. Double-click ${baseName}.exe  -- or from a terminal:
      ${baseName}.exe

3. Your browser opens automatically at http://localhost:3088
   Fill in the values and click "Generate .env File".

4. Activate the generated file:
      PowerShell :  Copy-Item .generated.env .env
      Command Prompt:  copy .generated.env .env

5. Restart the OpReady server for the changes to take effect.

NOTES
-----
- .example.env must be in the same folder as the executable.
- The tool writes .generated.env only -- it never overwrites .env directly.
- Port 3088 must be free. If it is in use, stop the conflicting process
  and retry.
- No Node.js installation required -- the Node.js 18 runtime is bundled
  inside this executable.
`;

fs.writeFileSync(txtPath, instructions, 'utf8');
console.log(`> Written  ${baseName}.txt`);
console.log(`\nDone — dist/${baseName}.exe  (${(fs.statSync(exePath).size / 1_048_576).toFixed(1)} MB)\n`);
