import { useConvex } from "convex/react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamHomePath, projectPath } from "@/lib/routes";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmProject } from "./-project.data";
import { useDashboardIndexData } from "./-index.data";
import { Id } from "@convex/_generated/dataModel";
import { DashboardHeader } from "@/components/DashboardHeader";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

type DashboardProjectCardProps = {
  teamSlug: string;
  project: {
    _id: Id<"projects">;
    name: string;
    videoCount: number;
  };
  onOpen: () => void;
};

function DashboardProjectCard({
  teamSlug,
  project,
  onOpen,
}: DashboardProjectCardProps) {
  const convex = useConvex();
  const prewarmIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmProject(convex, {
      teamSlug,
      projectId: project._id,
    }),
  );

  return (
    <Card
      className="group cursor-pointer hover:bg-[#e8e8e0] transition-colors"
      onClick={onOpen}
      {...prewarmIntentHandlers}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate">{project.name}</CardTitle>
          <CardDescription className="mt-1">
            {project.videoCount} video{project.videoCount !== 1 ? "s" : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-[#888] group-hover:text-[#1a1a1a] transition-colors">
          <span>Open project</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { teams } = useDashboardIndexData();
  const navigate = useNavigate({});

  // Auto-redirect to first team
  useEffect(() => {
    if (teams && teams.length > 0) {
      void navigate({ to: teamHomePath(teams[0].slug), replace: true });
    }
  }, [teams, navigate]);

  const isLoading = teams === undefined;

  // Show loading state while redirecting
  if (isLoading || (teams && teams.length > 0)) {
    return (
      <div className="h-full flex flex-col">
        <DashboardHeader paths={[{ label: "Snazzy Labs" }]} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#888] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Empty state - no teams (shouldn't normally happen for Snazzy Labs)
  return (
    <div className="h-full flex flex-col">
      <DashboardHeader paths={[{ label: "Snazzy Labs" }]} />
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[#888] text-sm">No teams found.</p>
      </div>
    </div>
  );
}
