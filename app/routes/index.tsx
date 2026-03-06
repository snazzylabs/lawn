import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import Homepage from "./-home";

export const Route = createFileRoute("/")({
  head: () =>
    seoHead({
      title: "Workspace Access",
      description: "Restricted access portal.",
      path: "/",
      noIndex: true,
      appendSiteName: false,
      siteName: "Workspace",
    }),
  component: Homepage,
});
