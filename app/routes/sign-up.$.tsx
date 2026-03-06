import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up/$")({
  beforeLoad: ({ search }) => {
    const searchParams = search as Record<string, unknown>;
    const redirectUrl =
      typeof searchParams.redirect_url === "string"
        ? searchParams.redirect_url
        : undefined;
    const href = redirectUrl
      ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
      : "/sign-in";

    throw redirect({
      href,
    });
  },
  component: () => null,
});
