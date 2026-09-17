# Changelog

All notable changes to this project will be documented in this file.

## [3.13.9] - 2026/09/18

- Add Penetration Test Report (Pass 4) for OpReady application

This commit introduces a comprehensive security assessment report detailing findings from the fourth penetration test of the OpReady application. The report includes an executive summary, scope and methodology, re-verification of previous findings, and a detailed account of new vulnerabilities identified during the assessment. Key highlights include the remediation status of prior findings, the discovery of new high-severity issues, and recommendations for immediate fixes to enhance application security.

## [3.13.8] - 2026/09/18

- feat: implement chunked restore functionality for large backups

- Added support for chunked uploads of backup files exceeding 32MB limit.
- Introduced new endpoints: /api/system/restore/chunk and /api/system/restore/finalize.
- Updated existing restore logic to handle .sql and .zip files, including Knowledge Base documents.
- Enhanced rate limiting for chunk uploads.
- Updated frontend to manage chunked uploads automatically.
- Improved documentation and help content regarding backup restoration.
- Added tests for chunked restore functionality.

## [3.13.7] - 2026/09/18

- feat: chunked upload for large full-backup restores — Cloud Run enforces a hard ~32MB request-body limit at the platform layer, which a full backup with a healthy Knowledge Base easily exceeds. The Backup & Restore UI now automatically splits large `.zip` files into chunks (`POST /api/system/restore/chunk`) and reassembles them server-side (`POST /api/system/restore/finalize`) before running the normal restore. Small files and direct API callers are unaffected.

## [3.13.6] - 2026/09/18

- feat: enhance full backup restore functionality with Knowledge Base document reconciliation for S3/GCS storage

## [3.13.5] - 2026/09/18

- fix: full backup restore now reconciles Knowledge Base documents when restoring into S3/GCS storage too, not just local — every bundled file is uploaded into this environment's own bucket and its record repointed, regardless of the source backup's storage type or bucket
- fix: `replaceFile()` in `services/knowledgebase-storage.js` referenced an undefined `gcsParts()` function in its GCS branch, breaking the "replace document file" admin feature for any GCS-backed environment

## [3.13.4] - 2026/09/17

- feat: implement full backup restore with knowledge base storage reconciliation

## [3.13.3] - 2026/09/17

- feat: add HTML sanitizer for rich text fields

- Implemented a new service for sanitizing TinyMCE-authored rich text to prevent XSS vulnerabilities.
- Added `sanitizeRichText` function to clean HTML input by stripping out dangerous tags and attributes.
- Introduced `sanitizeQuestionStructure` function to sanitize the `description` field of questions in forms/surveys.
- Created unit tests for both sanitization functions to ensure proper functionality and security.
- Added a migration to introduce a `resolver_token` column in the `knowledgebase_documents` table to enhance security.
- Developed a script to sanitize production database copies for testing environments, ensuring no real user data is exposed.

## [3.13.2] - 2026/09/16

- feat: add support for linking Knowledge Base documents to skills as refresher material

- Updated UAT testing plan to include new test cases for linking and unlinking Knowledge Base documents.
- Modified API to accept `kb_document_id` for skills, allowing optional linking to refresher materials.
- Enhanced validation to ensure proper handling of `kb_document_id`.
- Updated mailer service to include refresher material links in notifications for expiring skills.
- Added UI components for selecting and displaying linked Knowledge Base documents in the skills management interface.
- Implemented database migration to add `kb_document_id` column to the skills table.
- Created tests to verify the functionality of the new refresher material feature in member notifications and skills management.
- feat(guide-builder): implement PDF generation for Quiz Games guide
- feat: Add PDF rendering and quiz capture functionality for guide builder

## [3.13.1] - 2026/09/16

- feat: add example quiz games seeding to demo database script
- feat: enhance live quiz session management with email notification options
- feat: update cache version to v6 for service worker
- feat: add quiz performance report and host disconnection handling
- feat: implement live quiz rate limiting and enhance quiz functionality
- feat: Implement live-hosted timed quiz functionality (Phase 4)
- feat: Implement team session management for both score-based and timed quizzes

## [3.13.0] - 2026/09/16

- feat: enhance live quiz session management with email notification options
- feat: update cache version to v6 for service worker
- feat: add quiz performance report and host disconnection handling
- feat: implement live quiz rate limiting and enhance quiz functionality
- feat: Implement live-hosted timed quiz functionality (Phase 4)
- feat: Implement team session management for both score-based and timed quizzes

## [3.13.0-alpha.1] - 2026/09/14

- feat: add live quiz functionality with player submission and scoring

- Implemented the quiz play HTML interface for users to participate in quizzes.
- Created API routes for managing quiz sessions, including creation, player invitations, and score submissions.
- Developed scoring logic for quizzes, handling various question types and calculating scores based on user responses.
- Added unit tests for the live quiz API endpoints to ensure functionality and reliability.
- Included manual UI tests for mobile player views, ensuring proper rendering and interaction.
- feat: add quiz games management and preview functionality
- feat: add Water Dragon Ejector Pump questionnaire with detailed questions and options

## [3.12.1] - 2026/09/11

- feat: enhance Knowledge Base link picker with category filtering and improved UI

## [3.12.0] - 2026/09/11

- refactor: update Litestream configuration and session handling logic
- Implement code changes to enhance functionality and improve performance

## [3.11.1] - 2026/09/11

- release
- fix: filter Live Forms member dropdown to active members; drop redundant proxy-init event log

## [3.11.0] - 2026/09/11

- Refactor document upload and handling: 
- Updated API documentation and request handling to support additional file types (TXT, Markdown, PNG, JPG, BMP).
- Enhanced front-end file upload interface with category tabs for better user experience.
- Improved file validation to ensure correct content type matches declared types.
- Added support for inline viewing of text and image files in the knowledge base.
- Implemented expiry handling for documents, ensuring expired documents are not accessible.
- Updated tests to cover new file types and expiry scenarios.
- more gitignore
- more gitignore
- gitignore

## [3.10.6] - 2026/06/12

- fix: update Content Security Policy to allow images from Google Cloud Storage

## [3.10.5] - 2026/06/12

- feat(release): implement release notes modal with markdown rendering and caching
- refactor: remove unused backfill and generate UAT ETL fields scripts
- feat(release): enhance release notes generation with structured markdown and conventional commit grouping

## [3.10.4] - 2026/06/12

- feat(release): improve commit range determination by querying GitHub releases
- fix(release): correct commit range reference for tag handling

## [3.10.3] - 2026/06/12

- feat(release): enhance release script to display commit range and improve release notes handling
- feat(release): add commit range determination and auto-generate release notes
- feat(release): update release notes handling to include full commit messages
- feat(release): enhance tag creation logic and update documentation for existing tags

## [3.10.2] - 2026/06/12

- feat: update .example.env and documentation for variable declaration conventions

## [3.10.1] - 2026/06/11

- feat: enhance environment configuration options and documentation for APP_MODE

## [3.10.0] - 2026/06/11

- feat(ai-service): refactor prompt structure to enhance security against injection attacks
feat(api-keys): implement HMAC-SHA256 for API key hashing to improve security
fix(backup): update allowed SQL statement prefixes to enhance security
fix(users): use constant-time comparison for password verification to prevent timing attacks
fix(env-validator): enforce secure cookie settings in production environment
feat(mailer): sanitize email header values to prevent SMTP header injection
fix(html-scraper): enforce TLS certificate validation for secure connections
test(auth): add tests for login attempts and account blocking logic
test(knowledgebase): validate file content type during document upload
test(members): clamp pagination limits in API requests
test(reports): enforce limits on days parameter in report requests
test(skills): validate URL schemes in skill creation
test(ui): skip mutations in demo mode for various UI tests
feat(remote-backup): implement path traversal guards for backup location validation
- feat: Implement SSRF protection and URL validation
- Add URL validation utility to prevent SSRF vulnerabilities

## [3.9.1] - 2026/06/11

- feat: add parent commit ID to configuration and update about modal
- Implement code changes to enhance functionality and improve performance
- chore: update version metadata
- feat: add loading spinner during template save process
- feat: add geo-location support for API calls
- Update cloudflared-tunnel.md
- Update cloudflared-tunnel.md

