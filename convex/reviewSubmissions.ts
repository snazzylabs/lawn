import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const submit = mutation({
  args: {
    videoId: v.id("videos"),
    submittedByName: v.string(),
    submittedByCompany: v.optional(v.string()),
    guestSessionId: v.optional(v.string()),
    userClerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) throw new Error("Video not found");

    const project = await ctx.db.get(video.projectId);
    if (!project) throw new Error("Project not found");

    const submittedAt = Date.now();

    await ctx.db.insert("reviewSubmissions", {
      videoId: args.videoId,
      submittedByName: args.submittedByName,
      submittedByCompany: args.submittedByCompany,
      submittedAt,
      guestSessionId: args.guestSessionId,
      userClerkId: args.userClerkId,
    });

    await ctx.db.insert("notifications", {
      teamId: project.teamId,
      videoId: args.videoId,
      projectId: video.projectId,
      type: "review_submitted",
      message: `${args.submittedByName}${args.submittedByCompany ? ` (${args.submittedByCompany})` : ""} submitted a review on "${video.title}"`,
      read: false,
      createdAt: submittedAt,
    });
  },
});

export const hasSubmitted = query({
  args: {
    videoId: v.id("videos"),
    userIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("reviewSubmissions")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    return submissions.some(
      (s) =>
        s.guestSessionId === args.userIdentifier ||
        s.userClerkId === args.userIdentifier,
    );
  },
});
