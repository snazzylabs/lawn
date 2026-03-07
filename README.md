# Snazzy Labs Proofing Portal

Snazzy Labs' internal and client-facing video proofing app, built on top of [Jakkuh's fork of Lawn](https://github.com/jakkuh/lawn), which is based on [Theo/Ping's original Lawn](https://github.com/pingdotgg/lawn).

## Snazzy Fork Additions (Not in Theo/Jakkuh Base)

- Final Proof flow:
  - Per-video `Final Proof` flag
  - Prominent `Approve Final Cut` action for client and admin
  - Team notification when final cut is approved
- Notion integration:
  - Link/unlink Notion page per project from dashboard UI
  - Search Notion pages in-app before linking
  - Sync project URL into Notion `Proof` property
  - Throttled client-comment pings to Notion page
- snazzy.fm short-link integration for generated share URLs
- Expanded review input system:
  - Markup-on-frame (`Mark`) with preview thumbnail attached to comments
  - Comment file attachments (including drag/drop attach in viewer)
  - Range comments with timeline handles and keyboard-first in/out workflow
- Keyboard and review-ops enhancements:
  - Locked timestamp on `N` (comment time captured at hotkey press)
  - Playback hotkeys (`J`/`K`/`L`), mark hotkey (`M`)
  - Comment list keyboard navigation (`↑`/`↓`) and resolve hotkey (`R`)
- Team engagement notification coverage for review events (comments/replies/reactions/submissions)
- Storage lifecycle additions:
  - Multipart upload cleanup job
  - Attachment/blob cleanup on project deletion
  - Inactive project purge support with configurable window

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
