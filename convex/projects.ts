import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getUser, requireTeamAccess, requireProjectAccess } from "./auth";
import { assertTeamHasActiveSubscription } from "./billingHelpers";
import { purgeAndDeleteVideo } from "./videos";
import { nanoid } from "nanoid";
import { resolveActiveProjectShareGrant } from "./projectShareAccess";

const DEFAULT_PURGE_INACTIVITY_DAYS = 180;
const DEFAULT_PURGE_LIMIT = 25;
const MAX_PURGE_LIMIT = 200;

function normalizeInactivityDays(days?: number) {
  if (days === undefined) return DEFAULT_PURGE_INACTIVITY_DAYS;
  if (!Number.isFinite(days)) return DEFAULT_PURGE_INACTIVITY_DAYS;
  return Math.max(1, Math.floor(days));
}

function normalizePurgeLimit(limit?: number) {
  if (limit === undefined) return DEFAULT_PURGE_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_PURGE_LIMIT;
  return Math.min(MAX_PURGE_LIMIT, Math.max(1, Math.floor(limit)));
}

function getInactivityCutoffMs(days: number) {
  return Date.now() - Math.max(1, Math.floor(days)) * 24 * 60 * 60 * 1000;
}

function getProjectActivityTimestamp(project: { _creationTime: number; lastActivityAt?: number }) {
  return project.lastActivityAt ?? project._creationTime;
}

function formatNotionUuid(raw: string) {
  const normalized = raw.replace(/-/g, "").toLowerCase();
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function extractNotionPageId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const directUuid = trimmed.match(
    /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/,
  );
  if (directUuid) {
    return formatNotionUuid(directUuid[0]);
  }

  const directHex = trimmed.match(/^[0-9a-fA-F]{32}$/);
  if (directHex) {
    return formatNotionUuid(directHex[0]);
  }

  const match = trimmed.match(
    /([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})/,
  );
  if (!match) {
    return null;
  }

  return formatNotionUuid(match[1]);
}

function normalizeNotionPageInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return { notionPageId: undefined, notionPageUrl: undefined };
  }

  const notionPageId = extractNotionPageId(trimmed);
  if (!notionPageId) {
    throw new Error(
      "Invalid Notion page URL or page ID. Paste a page link or 32-character page ID.",
    );
  }

  try {
    const url = new URL(trimmed);
    return {
      notionPageId,
      notionPageUrl: url.toString(),
    };
  } catch {
    return {
      notionPageId,
      notionPageUrl: `https://www.notion.so/${notionPageId.replace(/-/g, "")}`,
    };
  }
}

export async function purgeAndDeleteProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) return;

  const videos = await ctx.db
    .query("videos")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const video of videos) {
    await purgeAndDeleteVideo(ctx, video._id);
  }

  const shareLinks = await ctx.db
    .query("projectShareLinks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const shareLink of shareLinks) {
    const grants = await ctx.db
      .query("projectShareAccessGrants")
      .withIndex("by_share_link", (q) => q.eq("shareLinkId", shareLink._id))
      .collect();
    for (const grant of grants) {
      await ctx.db.delete(grant._id);
    }
    await ctx.db.delete(shareLink._id);
  }

  await ctx.db.delete(projectId);
}

function getInactiveProjects<T extends { _creationTime: number; lastActivityAt?: number }>(
  projects: T[],
  cutoffMs: number,
) {
  return projects
    .filter((project) => getProjectActivityTimestamp(project) <= cutoffMs)
    .sort(
      (a, b) =>
        getProjectActivityTimestamp(a) - getProjectActivityTimestamp(b),
    );
}

export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "member");
    await assertTeamHasActiveSubscription(ctx, args.teamId);

    return await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      description: args.description,
      lastActivityAt: Date.now(),
    });
  },
});

export const list = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Get video counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const videos = await ctx.db
          .query("videos")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        return {
          ...project,
          videoCount: videos.length,
        };
      })
    );

    return projectsWithCounts;
  },
});

export const listUploadTargets = query({
  args: {
    teamSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .collect();

    const uploadableMemberships = memberships.filter(
      (membership) => membership.role !== "viewer",
    );

    const targets = await Promise.all(
      uploadableMemberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        if (!team) return [];
        if (args.teamSlug && team.slug !== args.teamSlug) return [];

        const projects = await ctx.db
          .query("projects")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();

        return projects.map((project) => ({
          projectId: project._id,
          projectName: project.name,
          teamId: team._id,
          teamName: team.name,
          teamSlug: team.slug,
          role: membership.role,
        }));
      }),
    );

    return targets
      .flat()
      .sort((a, b) =>
        a.teamName.localeCompare(b.teamName) ||
        a.projectName.localeCompare(b.projectName),
      );
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    return { ...project, role: membership.role };
  },
});

export const getById = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const updates: Partial<{ name: string; description: string; lastActivityAt: number }> = {
      lastActivityAt: Date.now(),
    };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.projectId, updates);
  },
});

export const setNotionPage = mutation({
  args: {
    projectId: v.id("projects"),
    notionPageInput: v.string(),
  },
  returns: v.object({
    notionPageId: v.optional(v.string()),
    notionPageUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const normalized = normalizeNotionPageInput(args.notionPageInput);
    await ctx.db.patch(args.projectId, {
      notionPageId: normalized.notionPageId,
      notionPageUrl: normalized.notionPageUrl,
      lastActivityAt: Date.now(),
    });

    return normalized;
  },
});

export const markNotionClientCommentNotified = internalMutation({
  args: {
    projectId: v.id("projects"),
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      notionLastClientCommentNotifiedAt: args.timestamp,
    });
    return null;
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");
    await purgeAndDeleteProject(ctx, args.projectId);
  },
});

export const generatePublicId = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    if (project.publicId) return project.publicId;

    const publicId = nanoid(12);
    await ctx.db.patch(args.projectId, {
      publicId,
      visibility: "public",
      lastActivityAt: Date.now(),
    });
    return publicId;
  },
});

export const setVisibility = mutation({
  args: {
    projectId: v.id("projects"),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  returns: v.object({
    publicId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    let publicId = project.publicId;
    if (args.visibility === "public" && !publicId) {
      publicId = nanoid(12);
    }

    await ctx.db.patch(args.projectId, {
      visibility: args.visibility,
      publicId,
      lastActivityAt: Date.now(),
    });

    return { publicId };
  },
});

export const countInactiveForTeam = query({
  args: {
    teamId: v.id("teams"),
    olderThanDays: v.optional(v.number()),
  },
  returns: v.object({
    count: v.number(),
    cutoffMs: v.number(),
    oldestActivityAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "admin");

    const inactivityDays = normalizeInactivityDays(args.olderThanDays);
    const cutoffMs = getInactivityCutoffMs(inactivityDays);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const inactiveProjects = getInactiveProjects(projects, cutoffMs);
    const oldestActivityAt =
      inactiveProjects.length > 0
        ? getProjectActivityTimestamp(inactiveProjects[0])
        : undefined;

    return {
      count: inactiveProjects.length,
      cutoffMs,
      oldestActivityAt,
    };
  },
});

export const purgeInactiveForTeam = mutation({
  args: {
    teamId: v.id("teams"),
    olderThanDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    purgedCount: v.number(),
    candidateCount: v.number(),
    cutoffMs: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "admin");

    const inactivityDays = normalizeInactivityDays(args.olderThanDays);
    const limit = normalizePurgeLimit(args.limit);
    const cutoffMs = getInactivityCutoffMs(inactivityDays);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const inactiveProjects = getInactiveProjects(projects, cutoffMs);
    const projectsToDelete = inactiveProjects.slice(0, limit);
    for (const project of projectsToDelete) {
      await purgeAndDeleteProject(ctx, project._id);
    }

    return {
      purgedCount: projectsToDelete.length,
      candidateCount: inactiveProjects.length,
      cutoffMs,
    };
  },
});

export const autoPurgeInactiveProjects = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    purgedCount: v.number(),
    candidateCount: v.number(),
    cutoffMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const inactivityDays = normalizeInactivityDays(args.olderThanDays);
    const limit = normalizePurgeLimit(args.limit);
    const cutoffMs = getInactivityCutoffMs(inactivityDays);
    const projects = await ctx.db.query("projects").collect();
    const inactiveProjects = getInactiveProjects(projects, cutoffMs);
    const projectsToDelete = inactiveProjects.slice(0, limit);

    for (const project of projectsToDelete) {
      await purgeAndDeleteProject(ctx, project._id);
    }

    return {
      purgedCount: projectsToDelete.length,
      candidateCount: inactiveProjects.length,
      cutoffMs,
    };
  },
});

async function getProjectListingPayload(
  ctx: QueryCtx,
  projectId: Id<"projects">,
) {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return null;
  }

  const videos = await ctx.db
    .query("videos")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .collect();

  const readyPublicVideos = videos.filter(
    (v) => v.status === "ready" && v.visibility === "public",
  );

  const videosWithCommentCounts = await Promise.all(
    readyPublicVideos.map(async (video) => {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      return {
        _id: video._id,
        publicId: video.publicId,
        title: video.title,
        description: video.description,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        workflowStatus: video.workflowStatus,
        commentCount: comments.filter((c) => !c.parentId).length,
      };
    }),
  );

  return {
    project: {
      _id: project._id,
      name: project.name,
      description: project.description,
    },
    videos: videosWithCommentCounts,
  };
}

export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!project || project.visibility !== "public") {
      return null;
    }

    return await getProjectListingPayload(ctx, project._id);
  },
});

export const getByPublicIdForShareGrant = query({
  args: {
    publicId: v.string(),
    grantToken: v.string(),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveProjectShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const project = await ctx.db.get(resolved.shareLink.projectId);
    if (!project || project.publicId !== args.publicId) {
      return null;
    }

    return await getProjectListingPayload(ctx, project._id);
  },
});
