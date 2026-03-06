import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import {
  identityAvatarUrl,
  identityName,
  requireVideoAccess,
  requireUser,
  getUser,
} from "./auth";
import { resolveActiveShareGrant } from "./shareAccess";

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
    isGuestOwned: Boolean(
      guestSessionId &&
        comment.guestSessionId &&
        comment.guestSessionId === guestSessionId,
    ),
  };
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

export const getById = query({
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

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.videoId !== args.videoId) {
        throw new Error("Invalid parent comment");
      }
    }

    return await ctx.db.insert("comments", {
      videoId: args.videoId,
      userClerkId: user.subject,
      userName: identityName(user),
      userAvatarUrl: identityAvatarUrl(user),
      text: args.text,
      timestampSeconds: args.timestampSeconds,
      endTimestampSeconds: args.endTimestampSeconds,
      drawingData: args.drawingData,
      parentId: args.parentId,
      resolved: false,
      userCompany: "Snazzy Labs",
    });
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

    return await ctx.db.insert("comments", {
      videoId: video._id,
      userClerkId: user ? user.subject : undefined,
      userName: user ? identityName(user) : (args.userName?.trim() || "Guest"),
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

    return await ctx.db.insert("comments", {
      videoId: video._id,
      userClerkId: user ? user.subject : undefined,
      userName: user ? identityName(user) : (args.userName?.trim() || "Guest"),
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

    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", args.commentId))
      .collect();

    for (const reply of replies) {
      await ctx.db.delete(reply._id);
    }

    await ctx.db.delete(args.commentId);
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

    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", args.commentId))
      .collect();

    for (const reply of replies) {
      await ctx.db.delete(reply._id);
    }

    await ctx.db.delete(args.commentId);
  },
});

export const toggleResolved = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    await requireVideoAccess(ctx, comment.videoId, "member");

    await ctx.db.patch(args.commentId, { resolved: !comment.resolved });
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

    return toThreadedComments(comments);
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

    return toThreadedComments(
      comments.map((c) => toPublicCommentPayload(c, args.guestSessionId)),
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

    return toThreadedComments(
      comments.map((c) => toPublicCommentPayload(c, args.guestSessionId)),
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
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    return await ctx.db.insert("commentAttachments", {
      commentId: args.commentId,
      s3Key: args.s3Key,
      filename: args.filename,
      fileSize: args.fileSize,
      contentType: args.contentType,
    });
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
  },
});

export const removeReaction = mutation({
  args: {
    commentId: v.id("comments"),
    emoji: v.string(),
    userIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
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
    return await ctx.db
      .query("commentAttachments")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
  },
});
