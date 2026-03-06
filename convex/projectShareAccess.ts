import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { generateUniqueToken } from "./security";

type ReadCtx = QueryCtx | MutationCtx;

export const PROJECT_SHARE_ACCESS_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

export async function findProjectShareLinkByToken(ctx: ReadCtx, token: string) {
  return await ctx.db
    .query("projectShareLinks")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

export async function cleanupExpiredProjectShareAccessGrantsForLink(
  ctx: MutationCtx,
  shareLinkId: Id<"projectShareLinks">,
) {
  const grants = await ctx.db
    .query("projectShareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", shareLinkId))
    .collect();

  const now = Date.now();
  for (const grant of grants) {
    if (grant.expiresAt <= now) {
      await ctx.db.delete(grant._id);
    }
  }
}

export async function issueProjectShareAccessGrant(
  ctx: MutationCtx,
  shareLinkId: Id<"projectShareLinks">,
  ttlMs = PROJECT_SHARE_ACCESS_GRANT_TTL_MS,
) {
  await cleanupExpiredProjectShareAccessGrantsForLink(ctx, shareLinkId);

  const token = await generateUniqueToken(
    40,
    async (candidate) =>
      (await ctx.db
        .query("projectShareAccessGrants")
        .withIndex("by_token", (q) => q.eq("token", candidate))
        .unique()) !== null,
    5,
  );

  const now = Date.now();
  await ctx.db.insert("projectShareAccessGrants", {
    shareLinkId,
    token,
    createdAt: now,
    expiresAt: now + ttlMs,
  });

  return token;
}

export async function resolveActiveProjectShareGrant(
  ctx: ReadCtx,
  grantToken: string,
): Promise<
  | {
      grant: Doc<"projectShareAccessGrants">;
      shareLink: Doc<"projectShareLinks">;
    }
  | null
> {
  const grant = await ctx.db
    .query("projectShareAccessGrants")
    .withIndex("by_token", (q) => q.eq("token", grantToken))
    .unique();

  if (!grant || grant.expiresAt <= Date.now()) {
    return null;
  }

  const shareLink = await ctx.db.get(grant.shareLinkId);
  if (!shareLink) {
    return null;
  }

  if (shareLink.expiresAt && shareLink.expiresAt <= Date.now()) {
    return null;
  }

  return { grant, shareLink };
}
