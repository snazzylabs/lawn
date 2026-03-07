"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const DEFAULT_COMMENT_NOTIFY_COOLDOWN_MINUTES = 180;
const DEFAULT_COMMENT_MENTION_NAMES = ["benjamin carroll", "quinn nelson"];
const DEFAULT_PROOF_UPLOAD_MENTION_NAMES = ["xochitl irvine"];

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

function getProofNotifyUserIds() {
  const explicit = (process.env.NOTION_PROOF_NOTIFY_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const xochitl = process.env.NOTION_XOCHITL_USER_ID?.trim();
  return [...new Set([
    ...explicit,
    ...(xochitl ? [xochitl] : []),
  ])];
}

function normalizeMentionName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function resolveMentionUserIdsByNames(
  notionApiKey: string,
  options: {
    explicitUserIds: string[];
    preferredNames: string[];
  },
) {
  const explicitUserIds = options.explicitUserIds;
  if (explicitUserIds.length > 0) {
    return explicitUserIds;
  }

  const targetNames = new Set(options.preferredNames.map(normalizeMentionName));
  const matched = new Map<string, string>();
  let cursor: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);

    const response = await fetch(`${NOTION_API_BASE}/users?${query.toString()}`, {
      method: "GET",
      headers: notionHeaders(notionApiKey),
    });
    if (!response.ok) {
      const responseText = await response.text();
      console.error("Failed to fetch Notion users for mentions", {
        status: response.status,
        response: responseText,
      });
      return [];
    }

    const payload = (await response.json()) as {
      results?: Array<Record<string, unknown>>;
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const user of payload.results ?? []) {
      const userId = typeof user.id === "string" ? user.id : null;
      const userName = typeof user.name === "string" ? user.name : "";
      if (!userId || !userName) continue;
      const normalizedUserName = normalizeMentionName(userName);
      const matchedName = [...targetNames].find((name) =>
        normalizedUserName === name ||
        normalizedUserName.includes(name) ||
        name.includes(normalizedUserName),
      );
      if (!matchedName) continue;
      matched.set(matchedName, userId);
    }

    if (matched.size >= targetNames.size) break;

    const hasMore = payload.has_more === true;
    const nextCursor =
      typeof payload.next_cursor === "string" && payload.next_cursor.length > 0
        ? payload.next_cursor
        : undefined;
    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
  }

  return options.preferredNames
    .map((name) => matched.get(normalizeMentionName(name)))
    .filter((value): value is string => Boolean(value));
}

async function resolveMentionUserIds(notionApiKey: string) {
  return resolveMentionUserIdsByNames(notionApiKey, {
    explicitUserIds: getMentionUserIds(),
    preferredNames: DEFAULT_COMMENT_MENTION_NAMES,
  });
}

async function resolveProofNotifyMentionUserIds(notionApiKey: string) {
  return resolveMentionUserIdsByNames(notionApiKey, {
    explicitUserIds: getProofNotifyUserIds(),
    preferredNames: DEFAULT_PROOF_UPLOAD_MENTION_NAMES,
  });
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
  pageTitle?: string;
  matchedBy?: "title" | "sponsor";
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

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function extractRichTextContent(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((segment) => {
      if (!segment || typeof segment !== "object") return "";
      const plainText = (segment as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("")
    .trim();
}

function extractPropertyText(property: Record<string, unknown> | undefined): string {
  if (!property) return "";
  const type = typeof property.type === "string" ? property.type : "";
  if (!type) return "";

  const rawValue = property[type];
  if (type === "title" || type === "rich_text") {
    return extractRichTextContent(rawValue);
  }

  if (type === "select") {
    if (!rawValue || typeof rawValue !== "object") return "";
    const name = (rawValue as Record<string, unknown>).name;
    return typeof name === "string" ? name.trim() : "";
  }

  if (type === "multi_select") {
    if (!Array.isArray(rawValue)) return "";
    return rawValue
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const name = (entry as Record<string, unknown>).name;
        return typeof name === "string" ? name.trim() : "";
      })
      .filter((entry) => entry.length > 0)
      .join(", ");
  }

  if (type === "url" || type === "email" || type === "phone_number") {
    return typeof rawValue === "string" ? rawValue.trim() : "";
  }

  if (type === "number") {
    return typeof rawValue === "number" ? String(rawValue) : "";
  }

  if (type === "formula" && rawValue && typeof rawValue === "object") {
    const formula = rawValue as Record<string, unknown>;
    if (typeof formula.string === "string") return formula.string.trim();
    if (typeof formula.number === "number") return String(formula.number);
    if (typeof formula.boolean === "boolean") return formula.boolean ? "true" : "false";
  }

  return "";
}

function extractPropertyByName(
  properties: Record<string, unknown> | undefined,
  propertyName: string,
) {
  if (!properties || typeof properties !== "object") return "";
  const normalizedName = normalizePropertyName(propertyName);

  const entries = Object.entries(properties);
  const exact = entries.find(([name]) => normalizePropertyName(name) === normalizedName);
  if (exact) {
    const value = exact[1];
    if (!value || typeof value !== "object") return "";
    return extractPropertyText(value as Record<string, unknown>);
  }

  const fuzzy = entries.find(([name]) => {
    const normalized = normalizePropertyName(name);
    return normalized.includes(normalizedName) || normalizedName.includes(normalized);
  });
  if (fuzzy) {
    const value = fuzzy[1];
    if (!value || typeof value !== "object") return "";
    return extractPropertyText(value as Record<string, unknown>);
  }

  return "";
}

function extractSponsorMatchTitle(sponsorText: string, query: string) {
  const trimmedSponsor = sponsorText.trim();
  if (!trimmedSponsor) return null;

  const normalizedQuery = normalizeSearchText(query);
  const normalizedSponsor = normalizeSearchText(trimmedSponsor);
  if (!normalizedSponsor.includes(normalizedQuery)) {
    return null;
  }

  const candidateSegments = trimmedSponsor
    .split(/\n|,|;|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const exactSegment = candidateSegments.find((segment) =>
    normalizeSearchText(segment).includes(normalizedQuery),
  );

  if (exactSegment) {
    return exactSegment;
  }

  return trimmedSponsor;
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

function mergeSearchResults(
  primary: NotionSearchPageResult[],
  secondary: NotionSearchPageResult[],
) {
  const merged = new Map<string, NotionSearchPageResult>();

  for (const entry of primary) {
    merged.set(entry.pageId, entry);
  }

  for (const entry of secondary) {
    const existing = merged.get(entry.pageId);
    if (!existing) {
      merged.set(entry.pageId, entry);
      continue;
    }
    if (entry.matchedBy === "sponsor") {
      merged.set(entry.pageId, {
        ...existing,
        ...entry,
      });
    }
  }

  return [...merged.values()].sort((a, b) => {
    const aTime = a.lastEditedTime ? Date.parse(a.lastEditedTime) : Number.NaN;
    const bTime = b.lastEditedTime ? Date.parse(b.lastEditedTime) : Number.NaN;
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
}

async function queryNotionDatabaseLikeCollection(
  notionApiKey: string,
  normalizedDatabaseId: string,
  pageSize: number,
  startCursor?: string,
) {
  const candidatePaths = [
    `${NOTION_API_BASE}/databases/${normalizedDatabaseId}/query`,
    `${NOTION_API_BASE}/data-sources/${normalizedDatabaseId}/query`,
  ];

  for (const path of candidatePaths) {
    const response = await fetch(path, {
      method: "POST",
      headers: notionHeaders(notionApiKey),
      body: JSON.stringify({
        page_size: pageSize,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });

    if (response.ok) {
      return {
        ok: true as const,
        payload: (await response.json()) as {
          results?: Array<Record<string, unknown>>;
          has_more?: boolean;
          next_cursor?: string | null;
        },
      };
    }

    const responseText = await response.text();
    const canTryFallback = response.status === 404 || response.status === 400;
    if (!canTryFallback) {
      console.error("Failed to query Notion collection", {
        status: response.status,
        response: responseText,
        path,
      });
      return {
        ok: false as const,
        reason: `notion_http_${response.status}`,
      };
    }
  }

  return {
    ok: false as const,
    reason: "notion_collection_query_failed",
  };
}

async function searchPagesBySponsorField(
  notionApiKey: string,
  normalizedDatabaseId: string,
  query: string,
  pageSize: number,
) {
  const sponsorQuery = normalizeSearchText(query);
  if (!sponsorQuery) return [] as NotionSearchPageResult[];

  const results: NotionSearchPageResult[] = [];
  const seenPageIds = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const response = await queryNotionDatabaseLikeCollection(
      notionApiKey,
      normalizedDatabaseId,
      Math.min(100, Math.max(pageSize * 2, 20)),
      cursor,
    );
    if (!response.ok) {
      break;
    }

    const rawResults = response.payload.results ?? [];
    for (const item of rawResults) {
      if (item.object !== "page") continue;
      const pageId = typeof item.id === "string" ? item.id : null;
      const url = typeof item.url === "string" ? item.url : null;
      if (!pageId || !url || seenPageIds.has(pageId)) continue;

      const pageTitle = extractNotionPageTitle(item);
      const properties =
        item.properties && typeof item.properties === "object"
          ? (item.properties as Record<string, unknown>)
          : undefined;
      const sponsorText = extractPropertyByName(properties, "sponsor");
      const sponsorMatchTitle = extractSponsorMatchTitle(sponsorText, query);
      if (!sponsorMatchTitle) continue;

      const lastEditedTime =
        typeof item.last_edited_time === "string"
          ? item.last_edited_time
          : undefined;

      results.push({
        pageId,
        title: sponsorMatchTitle,
        url,
        lastEditedTime,
        pageTitle,
        matchedBy: "sponsor",
      });
      seenPageIds.add(pageId);
    }

    if (results.length >= pageSize * 3) break;
    const hasMore = response.payload.has_more === true;
    const nextCursor =
      typeof response.payload.next_cursor === "string"
        ? response.payload.next_cursor
        : undefined;
    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
  }

  return results;
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
        pageTitle: v.optional(v.string()),
        matchedBy: v.optional(v.union(v.literal("title"), v.literal("sponsor"))),
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
          matchedBy: "title",
        });
      }

      const sponsorResults = normalizedDatabaseId
        ? await searchPagesBySponsorField(
          notionApiKey,
          normalizedDatabaseId,
          trimmedQuery,
          pageSize,
        )
        : [];

      const mergedResults = mergeSearchResults(results, sponsorResults).slice(0, pageSize);

      return {
        results: mergedResults,
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

export const notifyProjectProofUploaded = internalAction({
  args: {
    projectId: v.id("projects"),
    videoId: v.optional(v.id("videos")),
    source: v.union(v.literal("upload"), v.literal("notion_linked")),
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

    const project: Doc<"projects"> | null = await ctx.runQuery(internal.projects.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      return { ok: false, skipped: true, reason: "project_missing" };
    }
    if (!project.notionPageId) {
      return { ok: false, skipped: true, reason: "project_not_linked" };
    }

    const video: Doc<"videos"> | null = args.videoId
      ? await ctx.runQuery(internal.videos.getById, {
        videoId: args.videoId,
      })
      : await ctx.runQuery(internal.videos.getLatestByProject, {
        projectId: args.projectId,
      });
    if (!video || video.projectId !== args.projectId) {
      return { ok: false, skipped: true, reason: "video_missing" };
    }

    const mentionUserIds = await resolveProofNotifyMentionUserIds(notionApiKey);
    const appBaseUrl = getAppBaseUrl();
    const deepLink =
      appBaseUrl && video.publicId
        ? `${appBaseUrl.replace(/\/$/, "")}/watch/${video.publicId}`
        : null;

    const richText: NotionRichText[] = [
      {
        type: "text",
        text: {
          content: `New client proof uploaded: "${video.title}". `,
        },
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
        text: { content: "@Xochitl Irvine" },
      });
    }

    if (args.source === "notion_linked") {
      richText.push({
        type: "text",
        text: {
          content: " (Notion page was just linked to this project.)",
        },
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
        console.error("Failed to post Notion proof upload comment", {
          status: response.status,
          response: responseText,
          projectId: args.projectId,
          videoId: video._id,
        });
        return { ok: false, skipped: false, reason: `notion_http_${response.status}` };
      }

      return { ok: true, skipped: false };
    } catch (error) {
      console.error("Notion proof upload notification failed", error);
      return { ok: false, skipped: false, reason: "notion_request_failed" };
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

    const mentionUserIds = await resolveMentionUserIds(notionApiKey);
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
