"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const SNAZZY_API_BASE = "https://snazzy.fm/api";

function getSnazzyApiKey(): string {
  const key = process.env.SNAZZY_API_KEY;
  if (!key) throw new Error("SNAZZY_API_KEY environment variable not set");
  return key;
}

function generateAlias(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let alias = "";
  for (let i = 0; i < 6; i++) {
    alias += chars[Math.floor(Math.random() * chars.length)];
  }
  return alias;
}

export const createShortLink = action({
  args: {
    shareLinkId: v.id("shareLinks"),
    longUrl: v.string(),
  },
  returns: v.union(
    v.object({ shortUrl: v.string(), linkId: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const apiKey = getSnazzyApiKey();
    const alias = generateAlias();

    try {
      const response = await fetch(`${SNAZZY_API_BASE}/url/add`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: args.longUrl,
          custom: alias,
        }),
      });

      const data = await response.json();

      if (data.error && data.error !== 0 && data.error !== "0") {
        console.error("snazzy.fm API error:", data.message);
        return null;
      }

      const shortUrl = data.shorturl as string;
      const linkId = data.id as number;

      await ctx.runMutation(internal.shareLinks.setShortUrl, {
        shareLinkId: args.shareLinkId,
        shortUrl,
        shortLinkId: linkId,
      });

      return { shortUrl, linkId };
    } catch (error) {
      console.error("Failed to create snazzy.fm short link:", error);
      return null;
    }
  },
});

export const createProjectShortLink = action({
  args: {
    shareLinkId: v.id("projectShareLinks"),
    longUrl: v.string(),
  },
  returns: v.union(
    v.object({ shortUrl: v.string(), linkId: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const apiKey = getSnazzyApiKey();
    const alias = generateAlias();

    try {
      const response = await fetch(`${SNAZZY_API_BASE}/url/add`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: args.longUrl,
          custom: alias,
        }),
      });

      const data = await response.json();

      if (data.error && data.error !== 0 && data.error !== "0") {
        console.error("snazzy.fm API error:", data.message);
        return null;
      }

      const shortUrl = data.shorturl as string;
      const linkId = data.id as number;

      await ctx.runMutation(internal.projectShareLinks.setShortUrl, {
        shareLinkId: args.shareLinkId,
        shortUrl,
        shortLinkId: linkId,
      });

      return { shortUrl, linkId };
    } catch (error) {
      console.error("Failed to create snazzy.fm short link:", error);
      return null;
    }
  },
});

export const shortenUrl = action({
  args: {
    longUrl: v.string(),
  },
  returns: v.union(
    v.object({ shortUrl: v.string() }),
    v.null(),
  ),
  handler: async (_ctx, args) => {
    const apiKey = getSnazzyApiKey();
    const alias = generateAlias();

    try {
      const response = await fetch(`${SNAZZY_API_BASE}/url/add`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: args.longUrl,
          custom: alias,
        }),
      });

      const data = await response.json();

      if (data.error && data.error !== 0 && data.error !== "0") {
        console.error("snazzy.fm API error:", data.message);
        return null;
      }

      return { shortUrl: data.shorturl as string };
    } catch (error) {
      console.error("Failed to shorten URL:", error);
      return null;
    }
  },
});

export const deleteShortLink = action({
  args: {
    shortLinkId: v.number(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    const apiKey = getSnazzyApiKey();

    try {
      const response = await fetch(
        `${SNAZZY_API_BASE}/url/${args.shortLinkId}/delete`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();
      return !data.error || data.error === 0 || data.error === "0";
    } catch (error) {
      console.error("Failed to delete snazzy.fm short link:", error);
      return false;
    }
  },
});
