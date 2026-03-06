"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const DEFAULT_COMMENT_NOTIFY_COOLDOWN_MINUTES = 180;

function getNotionApiKey() {
  return process.env.NOTION_API_KEY ?? process.env.NOTION_TOKEN ?? null;
}

function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.SITE_URL ??
    null
  );
}

function getCommentNotifyCooldownMinutes() {
  const raw = process.env.NOTION_COMMENT_PING_COOLDOWN_MINUTES;
  if (!raw) return DEFAULT_COMMENT_NOTIFY_COOLDOWN_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMENT_NOTIFY_COOLDOWN_MINUTES;
  return Math.max(1, Math.floor(parsed));
}

function getMentionUserIds() {
  const explicit = (process.env.NOTION_MENTION_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const benjamin = process.env.NOTION_BENJAMIN_USER_ID?.trim();
  const quinn = process.env.NOTION_QUINN_USER_ID?.trim();
  return [...new Set([
    ...explicit,
    ...(benjamin ? [benjamin] : []),
    ...(quinn ? [quinn] : []),
  ])];
}

type NotionRichText =
  | { type: "text"; text: { content: string } }
  | { type: "mention"; mention: { type: "user"; user: { id: string } } };

export const notifyProjectClientComment = internalAction({
  args: {
    commentId: v.id("comments"),
    source: v.union(v.literal("public"), v.literal("share_grant")),
    linkPath: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    skipped: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; skipped: boolean; reason?: string }> => {
    const notionApiKey = getNotionApiKey();
    if (!notionApiKey) {
      return {
        ok: false,
        skipped: true,
        reason: "missing_notion_api_key",
      };
    }

    const comment: Doc<"comments"> | null = await ctx.runQuery(internal.comments.getById, {
      commentId: args.commentId,
    });
    if (!comment) {
      return { ok: false, skipped: true, reason: "comment_missing" };
    }

    const video: Doc<"videos"> | null = await ctx.runQuery(internal.videos.getById, {
      videoId: comment.videoId,
    });
    if (!video) {
      return { ok: false, skipped: true, reason: "video_missing" };
    }

    const project: Doc<"projects"> | null = await ctx.runQuery(internal.projects.getById, {
      projectId: video.projectId,
    });
    if (!project || !project.notionPageId) {
      return { ok: false, skipped: true, reason: "project_not_linked" };
    }
    const now = Date.now();
    const cooldownMs = getCommentNotifyCooldownMinutes() * 60 * 1000;
    const lastNotifiedAt = project.notionLastClientCommentNotifiedAt ?? 0;
    if (now - lastNotifiedAt < cooldownMs) {
      return { ok: false, skipped: true, reason: "cooldown_active" };
    }

    const mentionUserIds = getMentionUserIds();
    const appBaseUrl = getAppBaseUrl();
    const deepLink =
      appBaseUrl && args.linkPath
        ? `${appBaseUrl.replace(/\/$/, "")}${args.linkPath}`
        : null;

    const richText: NotionRichText[] = [
      {
        type: "text",
        text: {
          content: "Brand has added new comments to Snazzy Labs Proofing Portal.",
        },
      },
      {
        type: "text",
        text: { content: " " },
      },
    ];

    if (mentionUserIds.length > 0) {
      mentionUserIds.forEach((userId, index) => {
        richText.push({
          type: "mention",
          mention: {
            type: "user",
            user: { id: userId },
          },
        });
        if (index < mentionUserIds.length - 1) {
          richText.push({
            type: "text",
            text: { content: " " },
          });
        }
      });
    } else {
      richText.push({
        type: "text",
        text: { content: "@Benjamin Carroll @Quinn Nelson" },
      });
    }

    if (deepLink) {
      richText.push({
        type: "text",
        text: { content: `\n${deepLink}` },
      });
    }

    try {
      const response: Response = await fetch(`${NOTION_API_BASE}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: {
            page_id: project.notionPageId,
          },
          rich_text: richText,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error("Failed to post Notion comment", {
          status: response.status,
          response: responseText,
        });
        return { ok: false, skipped: false, reason: `notion_http_${response.status}` };
      }

      await ctx.runMutation(internal.projects.markNotionClientCommentNotified, {
        projectId: project._id,
        timestamp: now,
      });

      return { ok: true, skipped: false };
    } catch (error) {
      console.error("Notion comment sync failed", error);
      return { ok: false, skipped: false, reason: "notion_request_failed" };
    }
  },
});
