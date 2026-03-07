import { v } from "convex/values";
import { mutation, query, internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  identityAvatarUrl,
  identityName,
  requireVideoAccess,
  requireUser,
  getUser,
} from "./auth";
import { resolveActiveShareGrant } from "./shareAccess";
import { buildPublicContentUrl } from "./s3";

function toThreadedComments<T extends { _id: string; parentId?: string; timestampSeconds: number; _creationTime: number }>(
  comments: T[],
) {
  const topLevel = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  return topLevel.map((comment) => ({
    ...comment,
    replies: comments
      .filter((c) => c.parentId === comment._id)
      .sort((a, b) => a._creationTime - b._creationTime),
  }));
}

function toPublicCommentPayload(
  comment: {
    _id: string;
    _creationTime: number;
    text: string;
    timestampSeconds: number;
    endTimestampSeconds?: number;
    drawingData?: string;
    parentId?: string;
    resolved: boolean;
    userName: string;
    userAvatarUrl?: string;
    guestSessionId?: string;
    userCompany?: string;
    attachments?: AttachmentPayload[];
  },
  guestSessionId?: string,
) {
  return {
    _id: comment._id,
    _creationTime: comment._creationTime,
    text: comment.text,
    timestampSeconds: comment.timestampSeconds,
    endTimestampSeconds: comment.endTimestampSeconds,
    drawingData: comment.drawingData,
    parentId: comment.parentId,
    resolved: comment.resolved,
    userName: comment.userName,
    userAvatarUrl: comment.userAvatarUrl,
    userCompany: comment.userCompany,
    attachments: comment.attachments ?? [],
    isGuestOwned: Boolean(
      guestSessionId &&
        comment.guestSessionId &&
        comment.guestSessionId === guestSessionId,
    ),
  };
}

type AttachmentPayload = {
  _id: Id<"commentAttachments">;
  commentId: Id<"comments">;
  s3Key: string;
  filename: string;
  fileSize: number;
  contentType: string;
  url: string;
};

async function withAttachmentPayload<T extends { _id: Id<"comments"> }>(
  ctx: QueryCtx | MutationCtx,
  comments: T[],
): Promise<Array<T & { attachments: AttachmentPayload[] }>> {
  if (comments.length === 0) {
    return comments.map((comment) => ({ ...comment, attachments: [] }));
  }

  const uniqueCommentIds = [...new Set(comments.map((comment) => comment._id))];
  const attachmentsByCommentId = new Map<Id<"comments">, AttachmentPayload[]>();

  await Promise.all(
    uniqueCommentIds.map(async (commentId) => {
      const attachments = await ctx.db
        .query("commentAttachments")
        .withIndex("by_comment", (q) => q.eq("commentId", commentId))
        .collect();

      attachmentsByCommentId.set(
        commentId,
        attachments.map((attachment) => ({
          _id: attachment._id,
          commentId: attachment.commentId,
          s3Key: attachment.s3Key,
          filename: attachment.filename,
          fileSize: attachment.fileSize,
          contentType: attachment.contentType,
          url: buildPublicContentUrl(attachment.s3Key),
        })),
      );
    }),
  );

  return comments.map((comment) => ({
    ...comment,
    attachments: attachmentsByCommentId.get(comment._id) ?? [],
  }));
}

async function getPublicVideoByPublicId(
  ctx: QueryCtx | MutationCtx,
  publicId: string,
) {
  const video = await ctx.db
    .query("videos")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique();

  if (!video || video.visibility !== "public" || video.status !== "ready") {
    return null;
  }

  return video;
}

function excerpt(text: string, maxLength = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1)}…`
    : collapsed;
}

async function createTeamNotificationForVideo(
  ctx: MutationCtx,
  args: {
    videoId: Id<"videos">;
    projectId: Id<"projects">;
    type: string;
    message: string;
    actorUserClerkId?: string;
  },
) {
  const project = await ctx.db.get(args.projectId);
  if (!project) return;
  const now = Date.now();

  await ctx.db.insert("notifications", {
    teamId: project.teamId,
    videoId: args.videoId,
    projectId: args.projectId,
    type: args.type,
    message: args.message,
    actorUserClerkId: args.actorUserClerkId,
    read: false,
    createdAt: now,
  });
  await ctx.db.patch(args.projectId, { lastActivityAt: now });
}

async function scheduleNotionClientCommentNotification(
  ctx: MutationCtx,
  args: {
    commentId: Id<"comments">;
    source: "public" | "share_grant";
    linkPath: string;
  },
) {
  try {
    await ctx.scheduler.runAfter(0, internal.notionActions.notifyProjectClientComment, {
      commentId: args.commentId,
      source: args.source,
      linkPath: args.linkPath,
    });
  } catch (error) {
    console.error("Failed to schedule Notion notification", error);
  }
}

async function touchProjectActivityByVideo(
  ctx: MutationCtx,
  videoId: Id<"videos">,
) {
  const video = await ctx.db.get(videoId);
  if (!video) return;
  await ctx.db.patch(video.projectId, { lastActivityAt: Date.now() });
}

async function markVideoAsRework(
  ctx: MutationCtx,
  videoId: Id<"videos">,
) {
  const video = await ctx.db.get(videoId);
  if (!video) return;
  if (video.workflowStatus === "rework") return;
  await ctx.db.patch(videoId, { workflowStatus: "rework" });
}

async function purgeCommentArtifacts(ctx: MutationCtx, commentId: Id<"comments">) {
  const attachments = await ctx.db
    .query("commentAttachments")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  if (attachments.length > 0) {
    await ctx.scheduler.runAfter(0, internal.videoActions.purgeAttachmentFiles, {
      keys: attachments.map((attachment) => attachment.s3Key),
    });
    for (const attachment of attachments) {
      await ctx.db.delete(attachment._id);
    }
  }

  const reactions = await ctx.db
    .query("commentReactions")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const reaction of reactions) {
    await ctx.db.delete(reaction._id);
  }
}

async function deleteCommentThread(ctx: MutationCtx, rootCommentId: Id<"comments">) {
  const discovered: Id<"comments">[] = [];
  const stack: Id<"comments">[] = [rootCommentId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) break;
    discovered.push(currentId);

    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", currentId))
      .collect();
    for (const reply of replies) {
      stack.push(reply._id);
    }
  }

  for (const commentId of discovered.reverse()) {
    await purgeCommentArtifacts(ctx, commentId);
    await ctx.db.delete(commentId);
  }
}

export const getById = internalQuery({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.commentId);
  },
});

export const list = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId);

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    return comments.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  },
});

export const create = mutation({
  args: {
    videoId: v.id("videos"),
    text: v.string(),
    timestampSeconds: v.number(),
    endTimestampSeconds: v.optional(v.number()),
    drawingData: v.optional(v.string()),
    parentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireVideoAccess(ctx, args.videoId, "viewer");
    const video = await ctx.db.get(args.videoId);
    if (!video) throw new Error("Video not found");

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.videoId !== args.videoId) {
        throw new Error("Invalid parent comment");
      }
    }

    const actorName = identityName(user);
    const commentId = await ctx.db.insert("comments", {
      videoId: args.videoId,
      userClerkId: user.subject,
      userName: actorName,
      userAvatarUrl: identityAvatarUrl(user),
      text: args.text,
      timestampSeconds: args.timestampSeconds,
      endTimestampSeconds: args.endTimestampSeconds,
      drawingData: args.drawingData,
      parentId: args.parentId,
      resolved: false,
      userCompany: "Snazzy Labs",
    });

    const textSnippet = excerpt(args.text);
    const action = args.parentId ? "replied" : "commented";
    await createTeamNotificationForVideo(ctx, {
      videoId: video._id,
      projectId: video.projectId,
      type: args.parentId ? "comment_replied" : "comment_created",
      message: `${actorName} ${action} on "${video.title}"${textSnippet ? `: "${textSnippet}"` : ""}`,
      actorUserClerkId: user.subject,
    });

    return commentId;
  },
});

export const createForPublic = mutation({
  args: {
    publicId: v.string(),
    text: v.string(),
    timestampSeconds: v.number(),
    endTimestampSeconds: v.optional(v.number()),
    drawingData: v.optional(v.string()),
    parentId: v.optional(v.id("comments")),
    userName: v.optional(v.string()),
    guestSessionId: v.optional(v.string()),
    userCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const video = await getPublicVideoByPublicId(ctx, args.publicId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.videoId !== video._id) {
        throw new Error("Invalid parent comment");
      }
    }

    const actorName = user ? identityName(user) : (args.userName?.trim() || "Guest");
    const commentId = await ctx.db.insert("comments", {
      videoId: video._id,
      userClerkId: user ? user.subject : undefined,
      userName: actorName,
      userAvatarUrl: user ? identityAvatarUrl(user) : undefined,
      text: args.text,
      timestampSeconds: args.timestampSeconds,
      endTimestampSeconds: args.endTimestampSeconds,
      drawingData: args.drawingData,
      parentId: args.parentId,
      resolved: false,
      guestSessionId: user ? undefined : args.guestSessionId,
      userCompany: user ? "Snazzy Labs" : args.userCompany,
    });

    const textSnippet = excerpt(args.text);
    const action = args.parentId ? "replied" : "commented";
    await createTeamNotificationForVideo(ctx, {
      videoId: video._id,
      projectId: video.projectId,
      type: args.parentId ? "comment_replied" : "comment_created",
      message: `${actorName} ${action} on "${video.title}"${textSnippet ? `: "${textSnippet}"` : ""}`,
      actorUserClerkId: user?.subject,
    });
    await markVideoAsRework(ctx, video._id);
    await scheduleNotionClientCommentNotification(ctx, {
      commentId,
      source: "public",
      linkPath: `/watch/${args.publicId}`,
    });

    return commentId;
  },
});

export const createForShareGrant = mutation({
  args: {
    grantToken: v.string(),
    text: v.string(),
    timestampSeconds: v.number(),
    endTimestampSeconds: v.optional(v.number()),
    drawingData: v.optional(v.string()),
    parentId: v.optional(v.id("comments")),
    userName: v.optional(v.string()),
    guestSessionId: v.optional(v.string()),
    userCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);

    if (!resolved) {
      throw new Error("Invalid share grant");
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      throw new Error("Video not found");
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.videoId !== video._id) {
        throw new Error("Invalid parent comment");
      }
    }

    const actorName = user ? identityName(user) : (args.userName?.trim() || "Guest");
    const commentId = await ctx.db.insert("comments", {
      videoId: video._id,
      userClerkId: user ? user.subject : undefined,
      userName: actorName,
      userAvatarUrl: user ? identityAvatarUrl(user) : undefined,
      text: args.text,
      timestampSeconds: args.timestampSeconds,
      endTimestampSeconds: args.endTimestampSeconds,
      drawingData: args.drawingData,
      parentId: args.parentId,
      resolved: false,
      guestSessionId: user ? undefined : args.guestSessionId,
      userCompany: user ? "Snazzy Labs" : args.userCompany,
    });

    const textSnippet = excerpt(args.text);
    const action = args.parentId ? "replied" : "commented";
    await createTeamNotificationForVideo(ctx, {
      videoId: video._id,
      projectId: video.projectId,
      type: args.parentId ? "comment_replied" : "comment_created",
      message: `${actorName} ${action} on "${video.title}"${textSnippet ? `: "${textSnippet}"` : ""}`,
      actorUserClerkId: user?.subject,
    });
    await markVideoAsRework(ctx, video._id);
    await scheduleNotionClientCommentNotification(ctx, {
      commentId,
      source: "share_grant",
      linkPath: `/share/${args.grantToken}`,
    });

    return commentId;
  },
});

export const updateForGuest = mutation({
  args: {
    commentId: v.id("comments"),
    guestSessionId: v.string(),
    text: v.optional(v.string()),
    timestampSeconds: v.optional(v.number()),
    endTimestampSeconds: v.optional(v.number()),
    drawingData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (!comment.guestSessionId || comment.guestSessionId !== args.guestSessionId) {
      throw new Error("You can only edit your own comments");
    }

    const patch: Record<string, unknown> = {};
    if (args.text !== undefined) patch.text = args.text;
    if (args.timestampSeconds !== undefined) patch.timestampSeconds = args.timestampSeconds;
    if (args.endTimestampSeconds !== undefined) patch.endTimestampSeconds = args.endTimestampSeconds;
    if (args.drawingData !== undefined) patch.drawingData = args.drawingData;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.commentId, patch);
      await touchProjectActivityByVideo(ctx, comment.videoId);
    }
  },
});

export const removeForGuest = mutation({
  args: {
    commentId: v.id("comments"),
    guestSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (!comment.guestSessionId || comment.guestSessionId !== args.guestSessionId) {
      throw new Error("You can only delete your own comments");
    }

    await deleteCommentThread(ctx, args.commentId);
    await touchProjectActivityByVideo(ctx, comment.videoId);
  },
});

export const update = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.optional(v.string()),
    timestampSeconds: v.optional(v.number()),
    endTimestampSeconds: v.optional(v.number()),
    drawingData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (comment.userClerkId !== user.subject) {
      throw new Error("You can only edit your own comments");
    }

    const patch: Record<string, unknown> = {};
    if (args.text !== undefined) patch.text = args.text;
    if (args.timestampSeconds !== undefined) patch.timestampSeconds = args.timestampSeconds;
    if (args.endTimestampSeconds !== undefined) patch.endTimestampSeconds = args.endTimestampSeconds;
    if (args.drawingData !== undefined) patch.drawingData = args.drawingData;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.commentId, patch);
      await touchProjectActivityByVideo(ctx, comment.videoId);
    }
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (comment.userClerkId !== user.subject) {
      await requireVideoAccess(ctx, comment.videoId, "admin");
    }

    await deleteCommentThread(ctx, args.commentId);
    await touchProjectActivityByVideo(ctx, comment.videoId);
  },
});

export const toggleResolved = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    await requireVideoAccess(ctx, comment.videoId, "member");

    await ctx.db.patch(args.commentId, { resolved: !comment.resolved });
    await touchProjectActivityByVideo(ctx, comment.videoId);
  },
});

export const getThreaded = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId);

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    const commentsWithAttachments = await withAttachmentPayload(ctx, comments);
    return toThreadedComments(commentsWithAttachments);
  },
});

export const getThreadedForPublic = query({
  args: {
    publicId: v.string(),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const video = await getPublicVideoByPublicId(ctx, args.publicId);
    if (!video) {
      return [];
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", video._id))
      .collect();

    const commentsWithAttachments = await withAttachmentPayload(ctx, comments);
    return toThreadedComments(
      commentsWithAttachments.map((c) =>
        toPublicCommentPayload(c, args.guestSessionId),
      ),
    );
  },
});

export const getThreadedForShareGrant = query({
  args: {
    grantToken: v.string(),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return [];
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      return [];
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", video._id))
      .collect();

    const commentsWithAttachments = await withAttachmentPayload(ctx, comments);
    return toThreadedComments(
      commentsWithAttachments.map((c) =>
        toPublicCommentPayload(c, args.guestSessionId),
      ),
    );
  },
});

export const createAttachment = mutation({
  args: {
    commentId: v.id("comments"),
    s3Key: v.string(),
    filename: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    guestSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const user = await getUser(ctx);
    const userSubject = user?.subject;
    const isCommentOwner =
      (Boolean(userSubject) &&
        Boolean(comment.userClerkId) &&
        userSubject === comment.userClerkId) ||
      (Boolean(comment.guestSessionId) &&
        Boolean(args.guestSessionId) &&
        comment.guestSessionId === args.guestSessionId);

    if (!isCommentOwner) {
      throw new Error("Only the comment owner can add attachments");
    }
    if (!args.s3Key.startsWith(`attachments/${args.commentId}/`)) {
      throw new Error("Invalid attachment key");
    }

    const attachmentId = await ctx.db.insert("commentAttachments", {
      commentId: args.commentId,
      videoId: comment.videoId,
      s3Key: args.s3Key,
      filename: args.filename,
      fileSize: args.fileSize,
      contentType: args.contentType,
    });
    await touchProjectActivityByVideo(ctx, comment.videoId);
    return attachmentId;
  },
});

export const addReaction = mutation({
  args: {
    commentId: v.id("comments"),
    emoji: v.string(),
    userIdentifier: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    const video = await ctx.db.get(comment.videoId);
    if (!video) throw new Error("Video not found");

    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment_and_user", (q) =>
        q.eq("commentId", args.commentId).eq("userIdentifier", args.userIdentifier),
      )
      .collect();

    const alreadyReacted = existing.find((r) => r.emoji === args.emoji);
    if (alreadyReacted) return;

    await ctx.db.insert("commentReactions", {
      commentId: args.commentId,
      emoji: args.emoji,
      userIdentifier: args.userIdentifier,
      userName: args.userName,
    });

    const actorName = args.userName.trim() || "Someone";
    await createTeamNotificationForVideo(ctx, {
      videoId: video._id,
      projectId: video.projectId,
      type: "comment_reaction_added",
      message: `${actorName} reacted ${args.emoji} on "${video.title}"`,
    });
  },
});

export const removeReaction = mutation({
  args: {
    commentId: v.id("comments"),
    emoji: v.string(),
    userIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment_and_user", (q) =>
        q.eq("commentId", args.commentId).eq("userIdentifier", args.userIdentifier),
      )
      .collect();

    const match = existing.find((r) => r.emoji === args.emoji);
    if (match) {
      await ctx.db.delete(match._id);
    }
    await touchProjectActivityByVideo(ctx, comment.videoId);
  },
});

export const getReactionsForVideo = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    const result: Record<string, Array<{ emoji: string; count: number; userIdentifiers: string[] }>> = {};

    for (const comment of comments) {
      const reactions = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
        .collect();

      if (reactions.length === 0) continue;

      const grouped: Record<string, string[]> = {};
      for (const r of reactions) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.userIdentifier);
      }

      result[comment._id] = Object.entries(grouped).map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIdentifiers: userIds,
      }));
    }

    return result;
  },
});

export const getAttachmentsByComment = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      return [];
    }
    await requireVideoAccess(ctx, comment.videoId);

    return await ctx.db
      .query("commentAttachments")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
  },
});
