import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";

export const getUnread = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    return await ctx.db
      .query("notifications")
      .withIndex("by_team_and_read", (q) =>
        q.eq("teamId", args.teamId).eq("read", false),
      )
      .order("desc")
      .take(20);
  },
});

export const getAll = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    return await ctx.db
      .query("notifications")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(50);
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllRead = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_team_and_read", (q) =>
        q.eq("teamId", args.teamId).eq("read", false),
      )
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
  },
});
