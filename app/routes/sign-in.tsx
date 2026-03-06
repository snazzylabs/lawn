import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import { AuthShell } from "./auth/-layout";
import SignInPage from "./auth/-sign-in";

export const Route = createFileRoute("/sign-in")({
  head: () =>
    seoHead({
      title: "Access",
      description: "Restricted access portal.",
      path: "/sign-in",
      noIndex: true,
      appendSiteName: false,
      siteName: "Workspace",
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect_url:
      typeof search.redirect_url === "string" ? search.redirect_url : undefined,
  }),
  component: SignInRoute,
});

function SignInRoute() {
  return (
    <AuthShell>
      <SignInPage />
    </AuthShell>
  );
}
