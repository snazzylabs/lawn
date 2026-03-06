
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder, Plus, MoreVertical, Trash2, Users, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberInvite } from "@/components/teams/MemberInvite";
import { cn } from "@/lib/utils";
import { projectPath } from "@/lib/routes";
import { Id } from "@convex/_generated/dataModel";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmProject } from "./-project.data";
import { useTeamData } from "./-team.data";
import { DashboardHeader } from "@/components/DashboardHeader";

type TeamProjectCardProps = {
  teamSlug: string;
  project: {
    _id: Id<"projects">;
    name: string;
    videoCount: number;
  };
  canCreateProject: boolean;
  onOpen: () => void;
  onDelete: (projectId: Id<"projects">) => void;
};

function TeamProjectCard({
  teamSlug,
  project,
  canCreateProject,
  onOpen,
  onDelete,
}: TeamProjectCardProps) {
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
        {canCreateProject && (
          <DropdownMenu>
            <DropdownMenuTrigger
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-[#dc2626] focus:text-[#dc2626]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project._id);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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

export default function TeamPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";

  const { context, team, projects } = useTeamData({ teamSlug });
  const createProject = useMutation(api.projects.create);
  const deleteProject = useMutation(api.projects.remove);
  const purgeInactiveProjects = useMutation(api.projects.purgeInactiveForTeam);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [purgeWindowDays, setPurgeWindowDays] = useState(180);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const canManageMembers = team?.role === "owner" || team?.role === "admin";
  const canCreateProject = team?.role !== "viewer";

  const inactiveProjectStats = useQuery(
    api.projects.countInactiveForTeam,
    purgeDialogOpen && canManageMembers && team
      ? { teamId: team._id, olderThanDays: purgeWindowDays }
      : "skip",
  );

  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  const isLoadingData =
    context === undefined ||
    projects === undefined ||
    shouldCanonicalize;

  // Not found state
  if (context === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#888]">Team not found</div>
      </div>
    );
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !team) return;

    setIsLoading(true);
    try {
      const projectId = await createProject({
        teamId: team._id,
        name: newProjectName.trim(),
      });
      setCreateDialogOpen(false);
      setNewProjectName("");
      navigate({ to: projectPath(team.slug, projectId) });
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: Id<"projects">) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await deleteProject({ projectId });
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const handlePurgeOldProjects = async () => {
    if (!team) return;
    const count = inactiveProjectStats?.count ?? 0;
    if (count === 0) return;

    const proceed = confirm(
      `Permanently delete ${count} inactive project${count === 1 ? "" : "s"} older than ${purgeWindowDays} days?`,
    );
    if (!proceed) return;

    setIsPurging(true);
    try {
      const result = await purgeInactiveProjects({
        teamId: team._id,
        olderThanDays: purgeWindowDays,
        limit: 200,
      });
      const skipped =
        result.candidateCount > result.purgedCount
          ? ` ${result.candidateCount - result.purgedCount} additional project${result.candidateCount - result.purgedCount === 1 ? "" : "s"} remain and can be purged in another pass.`
          : "";
      alert(
        `Purged ${result.purgedCount} inactive project${result.purgedCount === 1 ? "" : "s"}.${skipped}`,
      );
      setPurgeDialogOpen(false);
    } catch (error) {
      console.error("Failed to purge inactive projects:", error);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[]} teamId={team?._id} teamSlug={team?.slug}>
        {canManageMembers && (
          <Button
            variant="outline"
            onClick={() => setMemberDialogOpen(true)}
          >
            <Users className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Members</span>
          </Button>
        )}
        {canCreateProject && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New project</span>
          </Button>
        )}
        {canManageMembers && (
          <Button
            variant="outline"
            onClick={() => setPurgeDialogOpen(true)}
          >
            <Trash2 className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Purge old projects</span>
          </Button>
        )}
      </DashboardHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {!isLoadingData && projects.length === 0 ? (
          <div className="h-full flex items-center justify-center animate-in fade-in duration-300">
            <Card className="max-w-sm text-center">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-2">
                  <Folder className="h-6 w-6 text-[#888]" />
                </div>
                <CardTitle className="text-lg">No projects yet</CardTitle>
                <CardDescription>
                  Create your first project to start uploading videos.
                </CardDescription>
              </CardHeader>
              {canCreateProject && (
                <CardContent>
                  <Button
                    className="w-full"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create project
                  </Button>
                </CardContent>
              )}
            </Card>
          </div>
        ) : (
          <div className={cn(
            "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity duration-300",
            isLoadingData ? "opacity-0" : "opacity-100"
          )}>
            {projects?.map((project) => (
              <TeamProjectCard
                key={project._id}
                teamSlug={team.slug}
                project={project}
                canCreateProject={canCreateProject}
                onOpen={() =>
                  navigate({ to: projectPath(team.slug, project._id) })
                }
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateProject}>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>
                Projects help you organize related videos together.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newProjectName.trim() || isLoading}
              >
                {isLoading ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge old projects</DialogTitle>
            <DialogDescription>
              Permanently delete projects with no activity in the selected window.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label
              htmlFor="purge-window-days"
              className="text-sm font-medium text-[#1a1a1a]"
            >
              Inactive longer than
            </label>
            <select
              id="purge-window-days"
              value={String(purgeWindowDays)}
              onChange={(event) => setPurgeWindowDays(Number(event.target.value))}
              className="h-10 w-full border border-[#d8d8d0] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#c5c5bc]"
            >
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">365 days</option>
              <option value="730">730 days</option>
            </select>
            <div className="rounded-md border border-[#d8d8d0] bg-[#f8f8f4] px-3 py-2 text-sm text-[#3d3d36]">
              {inactiveProjectStats
                ? `${inactiveProjectStats.count} project${inactiveProjectStats.count === 1 ? "" : "s"} currently match this window.`
                : "Loading project count..."}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPurgeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPurging || !inactiveProjectStats || inactiveProjectStats.count === 0}
              onClick={handlePurgeOldProjects}
            >
              {isPurging
                ? "Purging..."
                : `Purge ${inactiveProjectStats?.count ?? 0} project${(inactiveProjectStats?.count ?? 0) === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageMembers && team && (
        <MemberInvite
          teamId={team._id}
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
        />
      )}
    </div>
  );
}
