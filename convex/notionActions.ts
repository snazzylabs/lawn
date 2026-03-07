"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
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

type NotionPageProperty = {
  id: string;
  type: string;
  [key: string]: unknown;
};

type NotionSearchPageResult = {
  pageId: string;
  title: string;
  url: string;
  lastEditedTime?: string;
};

function notionHeaders(notionApiKey: string) {
  return {
    Authorization: `Bearer ${notionApiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function normalizeNotionId(value: string | null | undefined): string {
  return (value ?? "").replace(/-/g, "").trim().toLowerCase();
}

function getNotionSearchDatabaseId() {
  const raw =
    process.env.NOTION_PROJECTS_DATABASE_ID ??
    process.env.NOTION_DATABASE_ID ??
    "";
  const normalized = normalizeNotionId(raw);
  return normalized.length > 0 ? normalized : null;
}

function extractNotionPageTitle(page: Record<string, unknown>): string {
  const properties = page.properties as Record<string, unknown> | undefined;
  if (properties && typeof properties === "object") {
    for (const property of Object.values(properties)) {
      if (!property || typeof property !== "object") continue;
      const typedProperty = property as Record<string, unknown>;
      if (typedProperty.type !== "title") continue;

      const title = typedProperty.title;
      if (!Array.isArray(title)) continue;
      const content = title
        .map((segment) => {
          if (!segment || typeof segment !== "object") return "";
          const plainText = (segment as Record<string, unknown>).plain_text;
          return typeof plainText === "string" ? plainText : "";
        })
        .join("")
        .trim();
      if (content) return content;
    }
  }

  const directTitle = page.title;
  if (Array.isArray(directTitle)) {
    const content = directTitle
      .map((segment) => {
        if (!segment || typeof segment !== "object") return "";
        const plainText = (segment as Record<string, unknown>).plain_text;
        return typeof plainText === "string" ? plainText : "";
      })
      .join("")
      .trim();
    if (content) return content;
  }

  return "Untitled";
}

function parentMatchesDatabaseId(
  parent: Record<string, unknown> | undefined,
  normalizedDatabaseId: string,
) {
  if (!parent) return false;

  const databaseId = normalizeNotionId(
    typeof parent.database_id === "string" ? parent.database_id : undefined,
  );
  if (databaseId && databaseId === normalizedDatabaseId) return true;

  const dataSourceId = normalizeNotionId(
    typeof parent.data_source_id === "string" ? parent.data_source_id : undefined,
  );
  if (dataSourceId && dataSourceId === normalizedDatabaseId) return true;

  return false;
}

function normalizePropertyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findProofProperty(
  properties: Record<string, NotionPageProperty>,
): { name: string; property: NotionPageProperty } | null {
  const directMatch = Object.entries(properties).find(([name]) => {
    const normalized = normalizePropertyName(name);
    return normalized === "proof";
  });
  if (directMatch) {
    return { name: directMatch[0], property: directMatch[1] };
  }

  const containsProofMatch = Object.entries(properties).find(([name]) =>
    normalizePropertyName(name).includes("proof"),
  );
  if (containsProofMatch) {
    return { name: containsProofMatch[0], property: containsProofMatch[1] };
  }

  return null;
}

export const searchPagesForProject = action({
  args: {
    projectId: v.id("projects"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        pageId: v.string(),
        title: v.string(),
        url: v.string(),
        lastEditedTime: v.optional(v.string()),
      }),
    ),
    filteredToDatabase: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    results: NotionSearchPageResult[];
    filteredToDatabase: boolean;
    reason?: string;
  }> => {
    await ctx.runQuery(api.projects.get, { projectId: args.projectId });

    const notionApiKey = getNotionApiKey();
    if (!notionApiKey) {
      return {
        results: [],
        filteredToDatabase: false,
        reason: "missing_notion_api_key",
      };
    }

    const trimmedQuery = args.query.trim();
    if (trimmedQuery.length < 2) {
      return {
        results: [],
        filteredToDatabase: false,
      };
    }

    const pageSize = Math.min(20, Math.max(1, Math.floor(args.limit ?? 8)));
    const normalizedDatabaseId = getNotionSearchDatabaseId();

    try {
      const response = await fetch(`${NOTION_API_BASE}/search`, {
        method: "POST",
        headers: notionHeaders(notionApiKey),
        body: JSON.stringify({
          query: trimmedQuery,
          page_size: pageSize,
          filter: {
            property: "object",
            value: "page",
          },
          sort: {
            timestamp: "last_edited_time",
            direction: "descending",
          },
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error("Failed to search Notion pages", {
          status: response.status,
          response: responseText,
        });
        return {
          results: [],
          filteredToDatabase: Boolean(normalizedDatabaseId),
          reason: `notion_http_${response.status}`,
        };
      }

      const payload = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
      };
      const rawResults = payload.results ?? [];
      const filteredPages = rawResults
        .filter((item) => item.object === "page")
        .filter((item) => {
          if (!normalizedDatabaseId) return true;
          const parent =
            item.parent && typeof item.parent === "object"
              ? (item.parent as Record<string, unknown>)
              : undefined;
          return parentMatchesDatabaseId(parent, normalizedDatabaseId);
        });

      const results: NotionSearchPageResult[] = [];
      for (const item of filteredPages) {
        const pageId = typeof item.id === "string" ? item.id : null;
        const url = typeof item.url === "string" ? item.url : null;
        if (!pageId || !url) continue;

        const lastEditedTime =
          typeof item.last_edited_time === "string"
            ? item.last_edited_time
            : undefined;

        results.push({
          pageId,
          title: extractNotionPageTitle(item),
          url,
          lastEditedTime,
        });
      }

      return {
        results,
        filteredToDatabase: Boolean(normalizedDatabaseId),
      };
    } catch (error) {
      console.error("Notion page search failed", error);
      return {
        results: [],
        filteredToDatabase: Boolean(normalizedDatabaseId),
        reason: "notion_request_failed",
      };
    }
  },
});

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
        headers: notionHeaders(notionApiKey),
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

export const syncProjectProofUrl = internalAction({
  args: {
    notionPageId: v.string(),
    projectUrl: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    skipped: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (
    _ctx,
    args,
  ): Promise<{ ok: boolean; skipped: boolean; reason?: string }> => {
    const notionApiKey = getNotionApiKey();
    if (!notionApiKey) {
      return { ok: false, skipped: true, reason: "missing_notion_api_key" };
    }

    try {
      const pageResponse = await fetch(`${NOTION_API_BASE}/pages/${args.notionPageId}`, {
        method: "GET",
        headers: notionHeaders(notionApiKey),
      });

      if (!pageResponse.ok) {
        const responseText = await pageResponse.text();
        console.error("Failed to load Notion page for Proof sync", {
          status: pageResponse.status,
          response: responseText,
        });
        return {
          ok: false,
          skipped: false,
          reason: `notion_http_${pageResponse.status}`,
        };
      }

      const page = (await pageResponse.json()) as { properties?: Record<string, NotionPageProperty> };
      const properties = page.properties ?? {};
      const proofPropertyEntry = findProofProperty(properties);
      if (!proofPropertyEntry) {
        return { ok: false, skipped: true, reason: "proof_property_missing" };
      }
      const { name: proofPropertyName, property: proofProperty } = proofPropertyEntry;

      const projectUrl = args.projectUrl.trim();
      if (!projectUrl) {
        return { ok: false, skipped: true, reason: "project_url_missing" };
      }

      let proofPatch: Record<string, unknown> | null = null;
      if (proofProperty.type === "url") {
        proofPatch = { url: projectUrl };
      } else if (proofProperty.type === "rich_text") {
        proofPatch = {
          rich_text: [
            {
              type: "text",
              text: { content: projectUrl },
            },
          ],
        };
      } else if (proofProperty.type === "title") {
        proofPatch = {
          title: [
            {
              type: "text",
              text: { content: projectUrl },
            },
          ],
        };
      } else {
        return {
          ok: false,
          skipped: true,
          reason: `unsupported_property_type_${proofProperty.type}`,
        };
      }

      const updateResponse = await fetch(`${NOTION_API_BASE}/pages/${args.notionPageId}`, {
        method: "PATCH",
        headers: notionHeaders(notionApiKey),
        body: JSON.stringify({
          properties: {
            [proofPropertyName]: proofPatch,
          },
        }),
      });

      if (!updateResponse.ok) {
        const responseText = await updateResponse.text();
        console.error("Failed to update Notion Proof? property", {
          status: updateResponse.status,
          response: responseText,
        });
        return {
          ok: false,
          skipped: false,
          reason: `notion_http_${updateResponse.status}`,
        };
      }

      return { ok: true, skipped: false };
    } catch (error) {
      console.error("Notion Proof sync failed", error);
      return { ok: false, skipped: false, reason: "notion_request_failed" };
    }
  },
});
