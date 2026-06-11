# Changelog

All notable changes to this project will be documented in this file.

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

