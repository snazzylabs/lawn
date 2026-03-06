import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import ProjectPublicPage from "./-project-public";

export const Route = createFileRoute("/projects/$publicId")({
  head: () =>
    seoHead({
      title: "Project",
      description: "Browse videos in this project on Snazzy Labs.",
      path: "/projects",
      noIndex: true,
    }),
  component: ProjectPublicPage,
});
