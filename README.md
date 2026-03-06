# Snazzy Labs Video Review

A video review platform for creative teams, used internally at [Snazzy Labs](https://snazzylabs.com). Built on top of [Lawn](https://github.com/jakkuh/lawn) by Theo Browne / Ping Labs.

## What this fork does

Lawn is an excellent open-source video review tool. This fork adapts it for Snazzy Labs' internal workflow with a focus on client-facing review experiences and a distinctive visual identity.

### Design
- Brutalist, typographic design language with warm cream (`#f0f0e8`) backgrounds, strong `2px` borders, and sharp edges
- Blue accent (`#2F6DB4`) used sparingly for interactive elements
- Dramatic size contrast between headings and body text

### Client review experience
- **Guest commenting** — clients can leave timestamped comments without creating an account
- **Guest onboarding** — guided first-time experience for external reviewers
- **Avatars and replies** — threaded conversations with avatar display on public/share pages
- **Emoji reactions** — quick feedback with preset emoji reactions on any comment
- **Review submission** — clients can formally submit their review, notifying the team
- **Range markers (I/O points)** — mark in/out points on the timeline to reference specific segments
- **Drawing annotations** — sketch directly on video frames
- **File attachments** — attach reference files to comments

### Collaboration tools
- **Notification system** — bell icon in dashboard header with unread count and video deep links
- **Short links** — project and public video URLs shortened via snazzy.fm
- **Help dialog** — keyboard shortcut reference (I, O, Enter, Shift+Enter, Esc)
- **Workflow status** — review / rework / done tracking per video

### Infrastructure
- Self-hosted HLS transcoding via Docker/FFmpeg (alternative to Mux)
- S3-compatible storage (R2, Railway, etc.)
- Convex backend with Clerk authentication
- See upstream [setup](docs/setup.md) and [deployment](docs/deployment.md) docs

## Attribution

See [ATTRIBUTION.md](./ATTRIBUTION.md) for full details. This project is built on [Lawn](https://github.com/jakkuh/lawn), licensed under MIT by Ping Labs.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Ping Labs
