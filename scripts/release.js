#!/usr/bin/env node
/**
 * release.js — OpReady Release Script
 *
 * Reads the current version from package.json, creates a Git tag,
 * pushes it to origin, and creates a GitHub Release.
 * Version and versionDate are managed by the developer before running this script.
 *
 * Usage:
 *   node scripts/release.js
 *   npm run release
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT        = path.resolve(__dirname, '..');
const PKG_PATH    = path.join(ROOT, 'package.json');
const GITHUB_REPO = 'https://github.com/dassige/OSM';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd) {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function tryRun(cmd) {
    try { return { ok: true, out: run(cmd) }; }
    catch (e) { return { ok: false, err: (e.stderr || e.message || '').trim() }; }
}

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function abort(rl, msg) {
    console.error(`\n✖  ${msg}`);
    if (rl) rl.close();
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const pkg     = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const version = pkg.version;
    const tagName = `v${version}`;

    console.log('\n──────────────────────────────────');
    console.log(' OpReady Release Script');
    console.log('──────────────────────────────────');
    console.log(`Version : ${version}  →  tag: ${tagName}`);

    // 1. Clean working tree
    const dirty = run('git status --porcelain');
    if (dirty) abort(null, 'Working tree is not clean. Commit your changes first.\n\n' + dirty);

    // 2. Current branch
    const branch = run('git branch --show-current');
    if (branch !== 'main') {
        console.warn(`\n⚠   You are on branch "${branch}", not "main".`);
    }

    // 3. Tag existence check — skip creation if already present
    const tagExists = tryRun(`git rev-parse ${tagName}`).ok;
    if (tagExists) {
        console.warn(`\n⚠   Tag ${tagName} already exists — skipping tag creation.`);
    }

    // 4. gh CLI availability
    const ghAvail = tryRun('gh --version').ok;
    if (!ghAvail) {
        console.warn('\n⚠   GitHub CLI (gh) not found — the GitHub Release step will be skipped.');
        console.warn('    Install from https://cli.github.com/ to enable automatic release creation.\n');
    }

    // 5. Determine commit range and list commits to be included
    const tipRef      = tagExists ? `${tagName}^` : 'HEAD';
    const prevTagRes  = tryRun(`git describe --tags --abbrev=0 ${tipRef}`);
    const prevTagName = prevTagRes.ok ? prevTagRes.out : null;
    const rangeEnd    = tagExists ? tagName : 'HEAD';
    const commitRange = prevTagName ? `${prevTagName}..${rangeEnd}` : rangeEnd;

    const SEP = '__OPREADY_COMMIT__';
    const logRes = tryRun(`git log ${commitRange} --format=${SEP}%n%B`);
    const commits = logRes.ok
        ? logRes.out.split(SEP + '\n').map(s => s.trim()).filter(Boolean)
        : [];

    const sinceLabel = prevTagName ? `since ${prevTagName}` : 'all commits';
    console.log(`\nCommits in this release — ${sinceLabel} (${commits.length}):`);
    console.log('─'.repeat(50));
    if (commits.length === 0) {
        console.log('  (none)');
    } else {
        commits.forEach((msg, i) => {
            const lines = msg.split('\n');
            const subject = lines[0].trim();
            const body = lines.slice(1).join('\n').trim();
            console.log(`  ${i + 1}. ${subject}`);
            if (body) {
                body.split('\n').forEach(l => console.log(`     ${l}`));
                console.log('');
            }
        });
    }
    console.log('─'.repeat(50));

    // Pre-build markdown notes for step 9
    const autoNotes = commits.map(msg => {
        const lines = msg.split('\n');
        const subject = lines[0].trim();
        const body = lines.slice(1).join('\n').trim();
        return body ? `### ${subject}\n\n${body}` : `### ${subject}`;
    }).join('\n\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // 6. Confirm
    console.log('');
    const confirm = (await ask(rl, `Release ${tagName}? (y/N): `)).trim().toLowerCase();
    if (confirm !== 'y') {
        console.log('Aborted.');
        rl.close();
        process.exit(0);
    }

    // 7. Optional custom release notes
    let customNotes = '';
    if (ghAvail) {
        console.log('\nRelease notes (press Enter to include all commit messages in full):');
        customNotes = (await ask(rl, '> ')).trim();
    }

    rl.close();

    // 8. Create tag (skip if it already existed)
    if (!tagExists) {
        console.log(`\nCreating tag ${tagName} ...`);
        run(`git tag ${tagName}`);
    }

    // 9. Push tag
    console.log('Pushing tag to origin ...');
    const pushResult = tryRun(`git push origin ${tagName}`);
    if (!pushResult.ok) {
        if (tagExists) {
            console.warn(`\n⚠   Could not push tag ${tagName} (it may already be on remote): ${pushResult.err}`);
        } else {
            run(`git tag -d ${tagName}`);
            abort(null, `git push failed — local tag removed.\n${pushResult.err}`);
        }
    }

    // 10. GitHub release
    if (ghAvail) {
        console.log('Creating GitHub release ...');

        if (tryRun(`gh release view ${tagName}`).ok) {
            console.warn(`\n⚠   GitHub release for ${tagName} already exists — nothing to do.`);
            console.log('\nDone.\n');
            return;
        }

        const notes = customNotes || autoNotes;

        const tmpFile = path.join(ROOT, '.release-notes.tmp');
        fs.writeFileSync(tmpFile, notes || '(no release notes)', 'utf8');
        const ghCmd = `gh release create ${tagName} --title "${tagName}" --notes-file "${tmpFile}"`;

        const ghResult = tryRun(ghCmd);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

        if (!ghResult.ok) {
            console.warn(`\n⚠   GitHub release creation failed: ${ghResult.err}`);
            console.warn(`    Create it manually at: ${GITHUB_REPO}/releases/new?tag=${tagName}`);
        } else {
            console.log(`\n✔  Release published: ${GITHUB_REPO}/releases/tag/${tagName}`);
        }
    } else {
        console.log(`\n✔  Tag ${tagName} pushed.`);
        console.log(`   Create the GitHub Release at:`);
        console.log(`   ${GITHUB_REPO}/releases/new?tag=${tagName}`);
    }

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error('\n✖  Unexpected error:', err.message);
    process.exit(1);
});
