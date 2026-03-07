import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { getUser, identityName, requireProjectAccess, requireVideoAccess } from "./auth";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { generateUniqueToken } from "./security";
import { resolveActiveShareGrant } from "./shareAccess";
import { assertTeamCanStoreBytes } from "./billingHelpers";

const workflowStatusValidator = v.union(
  v.literal("review"),
  v.literal("rework"),
  v.literal("done"),
  v.literal("approved"),
);

const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

type WorkflowStatus =
  | "review"
  | "rework"
  | "done"
  | "approved";

function formatApproverName(
  name: string,
  company?: string,
) {
  const normalizedName = name.trim() || "Someone";
  const normalizedCompany = company?.trim();
  return normalizedCompany
    ? `${normalizedName} (${normalizedCompany})`
    : normalizedName;
}

async function notifyFinalCutApproved(
  ctx: MutationCtx,
  args: {
    teamId: Id<"teams">;
    projectId: Id<"projects">;
    videoId: Id<"videos">;
    videoTitle: string;
    approverName: string;
    approverCompany?: string;
  },
) {
  const actor = formatApproverName(args.approverName, args.approverCompany);
  await ctx.db.insert("notifications", {
    teamId: args.teamId,
    projectId: args.projectId,
    videoId: args.videoId,
    type: "final_cut_approved",
    message: `${actor} approved final cut on "${args.videoTitle}". Ready for publishing.`,
    read: false,
    createdAt: Date.now(),
  });
}

async function approveFinalCutInternal(
  ctx: MutationCtx,
  args: {
    videoId: Id<"videos">;
    approverName: string;
    approverCompany?: string;
  },
) {
  const video = await ctx.db.get(args.videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  if (!video.isFinalProof) {
    throw new Error("Final approval is only available for Final Proof videos.");
  }

  if (video.finalCutApprovedAt) {
    return {
      ok: true as const,
      alreadyApproved: true,
      approvedAt: video.finalCutApprovedAt,
    };
  }

  const project = await ctx.db.get(video.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const now = Date.now();
  const approver = args.approverName.trim() || "Someone";
  await ctx.db.patch(video._id, {
    workflowStatus: "approved",
    finalCutApprovedAt: now,
    finalCutApprovedByName: approver,
  });

  await notifyFinalCutApproved(ctx, {
    teamId: project.teamId,
    projectId: project._id,
    videoId: video._id,
    videoTitle: video.title,
    approverName: approver,
    approverCompany: args.approverCompany,
  });
  await touchProjectActivity(ctx, project._id);

  return {
    ok: true as const,
    alreadyApproved: false,
    approvedAt: now,
  };
}

function normalizeWorkflowStatus(
  status: WorkflowStatus | undefined,
  finalCutApprovedAt?: number,
): WorkflowStatus {
  if (finalCutApprovedAt) return "approved";
  return status ?? "review";
}

async function touchProjectActivity(ctx: MutationCtx, projectId: Id<"projects">) {
  await ctx.db.patch(projectId, { lastActivityAt: Date.now() });
}

async function generatePublicId(ctx: MutationCtx) {
  return await generateUniqueToken(
    32,
    async (candidate) =>
      (await ctx.db
        .query("videos")
        .withIndex("by_public_id", (q) => q.eq("publicId", candidate))
        .unique()) !== null,
    5,
  );
}

async function deleteShareAccessGrantsForLink(
  ctx: MutationCtx,
  linkId: Id<"shareLinks">,
) {
  const grants = await ctx.db
    .query("shareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", linkId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
    isFinalProof: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, project } = await requireProjectAccess(ctx, args.projectId, "member");
    await assertTeamCanStoreBytes(ctx, project.teamId, args.fileSize ?? 0);
    const publicId = await generatePublicId(ctx);

    const videoId = await ctx.db.insert("videos", {
      projectId: args.projectId,
      uploadedByClerkId: user.subject,
      uploaderName: identityName(user),
      title: args.title,
      description: args.description,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
      muxAssetStatus: "preparing",
      workflowStatus: "review",
      visibility: "public",
      publicId,
      isFinalProof: args.isFinalProof ?? false,
      finalCutApprovedAt: undefined,
      finalCutApprovedByName: undefined,
    });

    const existingProjectVideos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const existingVideo of existingProjectVideos) {
      if (
        existingVideo._id !== videoId &&
        existingVideo.status === "ready" &&
        existingVideo.workflowStatus !== "done" &&
        existingVideo.workflowStatus !== "approved"
      ) {
        await ctx.db.patch(existingVideo._id, { workflowStatus: "done" });
      }
    }

    await touchProjectActivity(ctx, args.projectId);
    try {
      await ctx.scheduler.runAfter(0, internal.notionActions.notifyProjectProofUploaded, {
        projectId: args.projectId,
        videoId,
        source: "upload",
      });
    } catch (error) {
      console.error("Failed to schedule Notion proof upload notification", error);
    }

    return videoId;
  },
});

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return await Promise.all(
      videos.map(async (video) => {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_video", (q) => q.eq("videoId", video._id))
          .collect();

        return {
          ...video,
          uploaderName: video.uploaderName ?? "Unknown",
          workflowStatus: normalizeWorkflowStatus(
            video.workflowStatus,
            video.finalCutApprovedAt,
          ),
          isFinalProof: video.isFinalProof ?? false,
          commentCount: comments.length,
        };
      }),
    );
  },
});

export const get = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video, membership } = await requireVideoAccess(ctx, args.videoId);
    return {
      ...video,
      uploaderName: video.uploaderName ?? "Unknown",
      workflowStatus: normalizeWorkflowStatus(
        video.workflowStatus,
        video.finalCutApprovedAt,
      ),
      role: membership.role,
      isFinalProof: video.isFinalProof ?? false,
    };
  },
});

export const getById = internalQuery({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.videoId);
  },
});

export const getLatestByProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .first();
  },
});

export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!video || video.visibility !== "public" || video.status !== "ready") {
      return null;
    }
    const project = await ctx.db.get(video.projectId);

    return {
      video: {
        _id: video._id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        muxAssetId: video.muxAssetId,
        muxPlaybackId: video.muxPlaybackId,
        hlsKey: video.hlsKey,
        thumbnailKey: video.thumbnailKey,
        spriteVttKey: video.spriteVttKey,
        contentType: video.contentType,
        s3Key: video.s3Key,
        workflowStatus: normalizeWorkflowStatus(
          video.workflowStatus,
          video.finalCutApprovedAt,
        ),
        isFinalProof: video.isFinalProof ?? false,
        finalCutApprovedAt: video.finalCutApprovedAt,
        finalCutApprovedByName: video.finalCutApprovedByName,
        projectPublicId: project?.publicId,
      },
    };
  },
});

export const getPublicIdByVideoId = query({
  args: { videoId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const normalizedVideoId = ctx.db.normalizeId("videos", args.videoId);
    if (!normalizedVideoId) {
      return null;
    }

    const video = await ctx.db.get(normalizedVideoId);
    if (!video || video.visibility !== "public" || video.status !== "ready" || !video.publicId) {
      return null;
    }

    return video.publicId;
  },
});

export const getByShareGrant = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      return null;
    }
    const project = await ctx.db.get(video.projectId);

    return {
      video: {
        _id: video._id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        muxAssetId: video.muxAssetId,
        muxPlaybackId: video.muxPlaybackId,
        hlsKey: video.hlsKey,
        thumbnailKey: video.thumbnailKey,
        spriteVttKey: video.spriteVttKey,
        contentType: video.contentType,
        s3Key: video.s3Key,
        workflowStatus: normalizeWorkflowStatus(
          video.workflowStatus,
          video.finalCutApprovedAt,
        ),
        isFinalProof: video.isFinalProof ?? false,
        finalCutApprovedAt: video.finalCutApprovedAt,
        finalCutApprovedByName: video.finalCutApprovedByName,
        projectPublicId: project?.publicId,
      },
      grantExpiresAt: resolved.grant.expiresAt,
    };
  },
});

export const getNextProofNumber = query({
  args: { projectId: v.id("projects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return videos.length + 1;
  },
});

export const update = mutation({
  args: {
    videoId: v.id("videos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isFinalProof: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "member");

    const updates: Partial<{ title: string; description: string; isFinalProof: boolean }> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isFinalProof !== undefined) updates.isFinalProof = args.isFinalProof;

    await ctx.db.patch(args.videoId, updates);
    await touchProjectActivity(ctx, video.projectId);
  },
});

export const setVisibility = mutation({
  args: {
    videoId: v.id("videos"),
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "member");

    await ctx.db.patch(args.videoId, {
      visibility: args.visibility,
    });
    await touchProjectActivity(ctx, video.projectId);
  },
});

export const updateWorkflowStatus = mutation({
  args: {
    videoId: v.id("videos"),
    workflowStatus: workflowStatusValidator,
  },
  handler: async (ctx, args) => {
    const { user, video } = await requireVideoAccess(ctx, args.videoId, "member");
    const nextStatus = args.workflowStatus;
    if (nextStatus === "approved") {
      await ctx.db.patch(args.videoId, {
        workflowStatus: "approved",
        finalCutApprovedAt: video.finalCutApprovedAt ?? Date.now(),
        finalCutApprovedByName: video.finalCutApprovedByName ?? identityName(user),
      });
    } else {
      await ctx.db.patch(args.videoId, {
        workflowStatus: nextStatus,
        finalCutApprovedAt: undefined,
        finalCutApprovedByName: undefined,
      });
    }
    await touchProjectActivity(ctx, video.projectId);
  },
});

export const approveFinalCut = mutation({
  args: {
    videoId: v.id("videos"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireVideoAccess(ctx, args.videoId, "viewer");
    return await approveFinalCutInternal(ctx, {
      videoId: args.videoId,
      approverName: identityName(user),
    });
  },
});

export const approveFinalCutForPublic = mutation({
  args: {
    publicId: v.string(),
    approvedByName: v.string(),
    approvedByCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();
    if (!video || video.visibility !== "public" || video.status !== "ready") {
      throw new Error("Video not found");
    }

    const user = await getUser(ctx);
    const approverName = user ? identityName(user) : args.approvedByName;
    return await approveFinalCutInternal(ctx, {
      videoId: video._id,
      approverName,
      approverCompany: args.approvedByCompany,
    });
  },
});

export const approveFinalCutForShareGrant = mutation({
  args: {
    grantToken: v.string(),
    approvedByName: v.string(),
    approvedByCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      throw new Error("Invalid share grant");
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      throw new Error("Video not found");
    }

    const user = await getUser(ctx);
    const approverName = user ? identityName(user) : args.approvedByName;
    return await approveFinalCutInternal(ctx, {
      videoId: video._id,
      approverName,
      approverCompany: args.approvedByCompany,
    });
  },
});

export const undoFinalCutApproval = mutation({
  args: {
    videoId: v.id("videos"),
  },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "admin");
    if (!video.isFinalProof || !video.finalCutApprovedAt) {
      return { ok: true, alreadyUndone: true };
    }

    await ctx.db.patch(args.videoId, {
      workflowStatus: "done",
      finalCutApprovedAt: undefined,
      finalCutApprovedByName: undefined,
    });
    await touchProjectActivity(ctx, video.projectId);
    return { ok: true, alreadyUndone: false };
  },
});

export const remove = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "admin");
    await purgeAndDeleteVideo(ctx, args.videoId);
    await touchProjectActivity(ctx, video.projectId);
  },
});

export async function purgeAndDeleteVideo(ctx: MutationCtx, videoId: Id<"videos">) {
  await ctx.scheduler.runAfter(0, internal.videoActions.purgeVideoFiles, {
    videoId: videoId as string,
  });

  const attachments = await ctx.db
    .query("commentAttachments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  if (attachments.length > 0) {
    await ctx.scheduler.runAfter(0, internal.videoActions.purgeAttachmentFiles, {
      keys: attachments.map((attachment) => attachment.s3Key),
    });
    for (const attachment of attachments) {
      await ctx.db.delete(attachment._id);
    }
  }

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  for (const comment of comments) {
    const reactions = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
      .collect();
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }
    await ctx.db.delete(comment._id);
  }

  const shareLinks = await ctx.db
    .query("shareLinks")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  for (const link of shareLinks) {
    await deleteShareAccessGrantsForLink(ctx, link._id);
    await ctx.db.delete(link._id);
  }

  const transcodeJobs = await ctx.db
    .query("transcodeJobs")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  for (const job of transcodeJobs) {
    await ctx.db.delete(job._id);
  }

  await ctx.db.delete(videoId);
}

export const setUploadInfo = internalMutation({
  args: {
    videoId: v.id("videos"),
    s3Key: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      s3Key: args.s3Key,
      muxUploadId: undefined,
      muxAssetId: undefined,
      muxPlaybackId: undefined,
      muxAssetStatus: "preparing",
      thumbnailUrl: undefined,
      duration: undefined,
      uploadError: undefined,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
    });
  },
});

export const reconcileUploadedObjectMetadata = internalMutation({
  args: {
    videoId: v.id("videos"),
    fileSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const project = await ctx.db.get(video.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const declaredSize =
      typeof video.fileSize === "number" && Number.isFinite(video.fileSize)
        ? Math.max(0, video.fileSize)
        : 0;
    const actualSize = Number.isFinite(args.fileSize) ? Math.max(0, args.fileSize) : 0;
    const sizeDelta = actualSize - declaredSize;

    if (sizeDelta > 0) {
      await assertTeamCanStoreBytes(ctx, project.teamId, sizeDelta);
    }

    await ctx.db.patch(args.videoId, {
      fileSize: actualSize,
      contentType: args.contentType,
    });
  },
});

export const markAsProcessing = internalMutation({
  args: {
    videoId: v.id("videos"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      status: "processing",
      muxAssetStatus: "preparing",
      uploadError: undefined,
    });
  },
});

export const markAsReady = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxAssetId: v.string(),
    muxPlaybackId: v.string(),
    duration: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxPlaybackId: args.muxPlaybackId,
      muxAssetStatus: "ready",
      duration: args.duration,
      thumbnailUrl: args.thumbnailUrl,
      uploadError: undefined,
      status: "ready",
    });
  },
});

export const markAsReadyFromTranscode = internalMutation({
  args: {
    videoId: v.id("videos"),
    hlsKey: v.string(),
    thumbnailKey: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      hlsKey: args.hlsKey,
      status: "ready",
      muxAssetStatus: "ready",
      uploadError: undefined,
    };
    if (args.thumbnailKey) patch.thumbnailKey = args.thumbnailKey;
    if (args.thumbnailUrl) patch.thumbnailUrl = args.thumbnailUrl;
    if (args.duration !== undefined) patch.duration = args.duration;
    await ctx.db.patch(args.videoId, patch);
  },
});

export const markAsFailed = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetStatus: "errored",
      uploadError: args.uploadError,
      status: "failed",
    });
  },
});

export const setMuxAssetReference = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxAssetId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxAssetStatus: "preparing",
      status: "processing",
    });
  },
});

export const setMuxPlaybackId = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxPlaybackId: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxPlaybackId: args.muxPlaybackId,
      thumbnailUrl: args.thumbnailUrl,
    });
  },
});

export const getVideoByMuxUploadId = internalQuery({
  args: {
    muxUploadId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_upload_id", (q) => q.eq("muxUploadId", args.muxUploadId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoByMuxAssetId = internalQuery({
  args: {
    muxAssetId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoForPlayback = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "viewer");
    return video;
  },
});

export const incrementViewCount = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const shareLink = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (shareLink) {
      await ctx.db.patch(shareLink._id, {
        viewCount: shareLink.viewCount + 1,
      });
    }
  },
});

export const updateDuration = mutation({
  args: {
    videoId: v.id("videos"),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "member");
    await ctx.db.patch(args.videoId, { duration: args.duration });
    await touchProjectActivity(ctx, video.projectId);
  },
});
