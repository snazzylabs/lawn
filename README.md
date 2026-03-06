# Snazzy Labs Proofing Portal

Snazzy Labs' internal and client-facing video proofing app, built on top of [Jakkuh's fork of Lawn](https://github.com/jakkuh/lawn), which is based on [Theo/Ping's original Lawn](https://github.com/pingdotgg/lawn).

## Current Product Scope

- Team/admin dashboard for projects, uploads, sharing, and review workflow
- Public/share review pages for clients without mandatory account creation
- Timestamped comments with optional in/out ranges and drawing annotations
- Threaded replies, emoji reactions, and file attachments on comments
- Final Proof workflow with explicit final-cut approval state
- Project-level and video-level restricted share links
- Team notifications for review activity (comments, replies, reactions, submissions, approvals)
- Notion integration:
  - Link a project to a Notion page from the project dashboard
  - Post throttled client-comment alerts to that Notion page

## Infrastructure and Backend

- Convex backend (queries, mutations, actions, internal cron jobs)
- Clerk authentication for team/admin access
- S3-compatible object storage (Cloudflare R2 compatible)
- Self-hosted transcoder support (plus Mux-compatible playback paths)
- snazzy.fm short-link integration for share links

## Data Lifecycle and Cleanup

- Stale multipart uploads are automatically aborted by cron
- Project/video deletion cascades clean up related comment attachments in object storage
- Inactive project auto-purge support (scheduled)
- Team-facing manual "Purge old projects" control with selectable time window

## Security and Secrets

- Secrets are read from environment variables only (never from client bundles)
- Common secret-bearing local files are gitignored (`.env*`, `.clerk/`, `.claude/`, etc.)
- Rotate and replace any credential that has ever been exposed in plain text

## Setup and Deployment

- Local setup: [docs/setup.md](docs/setup.md)
- Deployment notes: [docs/deployment.md](docs/deployment.md)

## Attribution

See [ATTRIBUTION.md](./ATTRIBUTION.md). This project builds on [Jakkuh's fork](https://github.com/jakkuh/lawn) of [Theo/Ping's original Lawn](https://github.com/pingdotgg/lawn), MIT-licensed by Ping Labs.

## License

[MIT](./LICENSE)
