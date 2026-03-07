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

## Recent Updates

- New-comment hotkey (`N`) now locks timestamp at keypress and shows a pending timeline marker
- Viewer hotkeys expanded:
  - `M` enters mark mode and pauses playback
  - `J`/`L` adjust speed by `0.25x`
  - `K` resets speed to `1x`
  - `R` resolves selected comments (team/admin), with `↑`/`↓` keyboard navigation
- Markup UX polish:
  - "Draw annotation" terminology updated to "Mark"
  - Pending mark preview and removable mark thumbnail in composer
- Public/share comments automatically set video workflow status to `Rework`
- Drag-and-drop in viewer now shows an explicit "Drop file here to attach" affordance and attaches directly to draft comments
- Final Proof banner styling and readability improved for dark mode
- Notion link modal is now responsive to viewport size and no longer overflows on smaller windows
- Notion link add/remove notifications were repositioned to avoid overlapping action buttons
- Notion "Proof" field sync now supports property names beyond exact `"Proof?"` (e.g., `"Proof"`)

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

## Forkability and Upstream Portability

- This repository is MIT-licensed, so others can legally fork and reuse code with license notice preservation.
- Features are intentionally implemented in discrete modules (Convex functions + UI components) to make cherry-picking straightforward.
- If you want to port features upstream:
  - Prefer copying isolated files and corresponding schema/function changes together
  - Keep feature flags and environment-variable requirements explicit
  - Preserve attribution links to both [Jakkuh's fork](https://github.com/jakkuh/lawn) and [Theo/Ping's original](https://github.com/pingdotgg/lawn)
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for practical extraction and implementation notes.

## Attribution

See [ATTRIBUTION.md](./ATTRIBUTION.md). This project builds on [Jakkuh's fork](https://github.com/jakkuh/lawn) of [Theo/Ping's original Lawn](https://github.com/pingdotgg/lawn), MIT-licensed by Ping Labs.

## License

[MIT](./LICENSE)
