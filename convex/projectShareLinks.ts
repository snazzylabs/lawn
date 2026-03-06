import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { nanoid } from "nanoid";
import { components } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
} from "./_generated/server";
import { identityName, requireProjectAccess } from "./auth";
import { hashPassword, verifyPassword, generateUniqueToken } from "./security";
import {
  findProjectShareLinkByToken,
  issueProjectShareAccessGrant,
} from "./projectShareAccess";

const shareLinkStatusValidator = v.union(
  v.literal("missing"),
  v.literal("expired"),
  v.literal("requiresPassword"),
  v.literal("ok"),
);

const MAX_SHARE_PASSWORD_LENGTH = 256;
const PASSWORD_MAX_FAILED_ATTEMPTS = 5;
const PASSWORD_LOCKOUT_MS = 10 * MINUTE;

const projectShareRateLimiter = new RateLimiter(components.rateLimiter, {
  grantGlobal: {
    kind: "fixed window",
    rate: 600,
    period: MINUTE,
    shards: 8,
  },
  grantByToken: {
    kind: "fixed window",
    rate: 120,
    period: MINUTE,
  },
  passwordFailuresByToken: {
    kind: "fixed window",
    rate: 10,
    period: MINUTE,
  },
});

function hasPasswordProtection(
  link: Pick<Doc<"projectShareLinks">, "password" | "passwordHash">,
) {
  return Boolean(link.passwordHash || link.password);
}

function normalizeProvidedPassword(password: string | null | undefined) {
  if (password === undefined || password === null || password.length === 0) {
    return undefined;
  }

  if (password.length > MAX_SHARE_PASSWORD_LENGTH) {
    throw new Error("Password is too long");
  }

  return password;
}

async function generateProjectShareToken(ctx: MutationCtx) {
  return await generateUniqueToken(
    32,
    async (candidate) =>
      (await ctx.db
        .query("projectShareLinks")
        .withIndex("by_token", (q) => q.eq("token", candidate))
        .unique()) !== null,
    5,
  );
}

async function ensureProjectPublicId(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<string> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  if (project.publicId) {
    return project.publicId;
  }

  const publicId = nanoid(12);
  await ctx.db.patch(projectId, { publicId });
  return publicId;
}

async function deleteProjectShareAccessGrantsForLink(
  ctx: MutationCtx,
  shareLinkId: Id<"projectShareLinks">,
) {
  const grants = await ctx.db
    .query("projectShareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", shareLinkId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    expiresInDays: v.optional(v.number()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProjectAccess(ctx, args.projectId, "member");
    const projectPublicId = await ensureProjectPublicId(ctx, args.projectId);

    const token = await generateProjectShareToken(ctx);
    const expiresAt = args.expiresInDays
      ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;
    const normalizedPassword = normalizeProvidedPassword(args.password);
    const passwordHash = normalizedPassword
      ? await hashPassword(normalizedPassword)
      : undefined;

    const linkId = await ctx.db.insert("projectShareLinks", {
      projectId: args.projectId,
      token,
      createdByClerkId: user.subject,
      createdByName: identityName(user),
      expiresAt,
      password: undefined,
      passwordHash,
      failedAccessAttempts: 0,
      lockedUntil: undefined,
      viewCount: 0,
    });

    return { token, linkId, projectPublicId };
  },
});

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const links = await ctx.db
      .query("projectShareLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return links.map((link) => ({
      _id: link._id,
      _creationTime: link._creationTime,
      projectId: link.projectId,
      token: link.token,
      createdByClerkId: link.createdByClerkId,
      createdByName: link.createdByName,
      expiresAt: link.expiresAt,
      viewCount: link.viewCount,
      hasPassword: hasPasswordProtection(link),
      creatorName: link.createdByName,
      isExpired: link.expiresAt ? link.expiresAt < Date.now() : false,
      shortUrl: link.shortUrl,
    }));
  },
});

export const remove = mutation({
  args: { linkId: v.id("projectShareLinks") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Project share link not found");

    await requireProjectAccess(ctx, link.projectId, "member");
    await deleteProjectShareAccessGrantsForLink(ctx, args.linkId);
    await ctx.db.delete(args.linkId);
  },
});

export const update = mutation({
  args: {
    linkId: v.id("projectShareLinks"),
    expiresInDays: v.optional(v.union(v.number(), v.null())),
    password: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Project share link not found");

    await requireProjectAccess(ctx, link.projectId, "member");

    const updates: Partial<Doc<"projectShareLinks">> = {};

    if (args.expiresInDays !== undefined) {
      updates.expiresAt = args.expiresInDays
        ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
        : undefined;
    }

    if (args.password !== undefined) {
      const normalizedPassword = normalizeProvidedPassword(args.password ?? undefined);
      if (normalizedPassword) {
        updates.passwordHash = await hashPassword(normalizedPassword);
        updates.password = undefined;
      } else {
        updates.passwordHash = undefined;
        updates.password = undefined;
      }
      updates.failedAccessAttempts = 0;
      updates.lockedUntil = undefined;
    }

    await ctx.db.patch(args.linkId, updates);
  },
});

export const getByToken = query({
  args: { token: v.string() },
  returns: v.object({
    status: shareLinkStatusValidator,
  }),
  handler: async (ctx, args) => {
    const link = await findProjectShareLinkByToken(ctx, args.token);

    if (!link) {
      return { status: "missing" as const };
    }

    if (link.expiresAt && link.expiresAt < Date.now()) {
      return { status: "expired" as const };
    }

    const project = await ctx.db.get(link.projectId);
    if (!project) {
      return { status: "missing" as const };
    }

    if (hasPasswordProtection(link)) {
      return { status: "requiresPassword" as const };
    }

    return { status: "ok" as const };
  },
});

export const issueAccessGrant = mutation({
  args: {
    token: v.string(),
    password: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    grantToken: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const globalAccessLimit = await projectShareRateLimiter.limit(ctx, "grantGlobal");
    if (!globalAccessLimit.ok) {
      return { ok: false, grantToken: null };
    }

    const accessLimit = await projectShareRateLimiter.limit(ctx, "grantByToken", {
      key: args.token,
    });
    if (!accessLimit.ok) {
      return { ok: false, grantToken: null };
    }

    const link = await findProjectShareLinkByToken(ctx, args.token);
    if (!link) {
      return { ok: false, grantToken: null };
    }

    const now = Date.now();

    if (link.expiresAt && link.expiresAt <= now) {
      return { ok: false, grantToken: null };
    }

    const project = await ctx.db.get(link.projectId);
    if (!project) {
      return { ok: false, grantToken: null };
    }

    if (hasPasswordProtection(link)) {
      if (link.lockedUntil && link.lockedUntil > now) {
        return { ok: false, grantToken: null };
      }

      const password = args.password ?? "";
      let passwordMatches = false;
      if (link.passwordHash) {
        passwordMatches = await verifyPassword(password, link.passwordHash);
      } else if (link.password) {
        passwordMatches = password === link.password;
      }

      if (!passwordMatches) {
        await projectShareRateLimiter.limit(ctx, "passwordFailuresByToken", {
          key: args.token,
        });

        const failedAccessAttempts = (link.failedAccessAttempts ?? 0) + 1;
        const updates: Partial<Doc<"projectShareLinks">> = {
          failedAccessAttempts,
        };
        if (failedAccessAttempts >= PASSWORD_MAX_FAILED_ATTEMPTS) {
          updates.failedAccessAttempts = 0;
          updates.lockedUntil = now + PASSWORD_LOCKOUT_MS;
        }

        await ctx.db.patch(link._id, updates);
        return { ok: false, grantToken: null };
      }

      const successUpdates: Partial<Doc<"projectShareLinks">> = {};
      if ((link.failedAccessAttempts ?? 0) > 0) {
        successUpdates.failedAccessAttempts = 0;
      }
      if (link.lockedUntil !== undefined) {
        successUpdates.lockedUntil = undefined;
      }
      if (link.password && !link.passwordHash) {
        successUpdates.passwordHash = await hashPassword(link.password);
        successUpdates.password = undefined;
      }

      if (Object.keys(successUpdates).length > 0) {
        await ctx.db.patch(link._id, successUpdates);
      }
    }

    const grantToken = await issueProjectShareAccessGrant(ctx, link._id);

    await ctx.db.patch(link._id, {
      viewCount: link.viewCount + 1,
    });

    return {
      ok: true,
      grantToken,
    };
  },
});

export const setShortUrl = internalMutation({
  args: {
    shareLinkId: v.id("projectShareLinks"),
    shortUrl: v.string(),
    shortLinkId: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shareLinkId, {
      shortUrl: args.shortUrl,
      shortLinkId: args.shortLinkId,
    });
  },
});
