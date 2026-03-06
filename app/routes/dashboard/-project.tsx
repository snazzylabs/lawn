
import { useAction, useConvex, useMutation, useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { UploadButton } from "@/components/upload/UploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import { triggerDownload } from "@/lib/download";
import {
  Play,
  MoreVertical,
  Trash2,
  Edit2,
  Minus,
  Search,
  Loader2,
  Link as LinkIcon,
  Grid3X3,
  LayoutList,
  Download,
  MessageSquare,
  Eye,
  Share2,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { projectPath, videoPath } from "@/lib/routes";
import { prefetchHlsRuntime, prefetchMuxPlaybackManifest } from "@/lib/muxPlayback";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import {
  VideoWorkflowStatusControl,
  type VideoWorkflowStatus,
} from "@/components/videos/VideoWorkflowStatusControl";
import { useProjectData } from "./-project.data";
import { prewarmVideo } from "./-video.data";
import { useDashboardUploadContext } from "@/lib/dashboardUploadContext";
import { DashboardHeader } from "@/components/DashboardHeader";
import { ProjectShareDialog } from "@/components/ProjectShareDialog";

type ViewMode = "grid" | "list";
type ShareToastState = {
  tone: "success" | "error";
  message: string;
};

type NotionSearchResult = {
  pageId: string;
  title: string;
  url: string;
  lastEditedTime?: string;
};

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

type VideoIntentTargetProps = {
  className: string;
  teamSlug: string;
  projectId: Id<"projects">;
  videoId: Id<"videos">;
  muxPlaybackId?: string;
  onOpen: () => void;
  children: ReactNode;
};

function VideoIntentTarget({
  className,
  teamSlug,
  projectId,
  videoId,
  muxPlaybackId,
  onOpen,
  children,
}: VideoIntentTargetProps) {
  const convex = useConvex();
  const prewarmIntentHandlers = useRoutePrewarmIntent(() => {
    prewarmVideo(convex, {
      teamSlug,
      projectId,
      videoId,
    });
    prefetchHlsRuntime();
    if (muxPlaybackId) {
      prefetchMuxPlaybackManifest(muxPlaybackId);
    }
  });

  return (
    <div
      className={className}
      onClick={onOpen}
      {...prewarmIntentHandlers}
    >
      {children}
    </div>
  );
}

export default function ProjectPage({
  teamSlug,
  projectId,
}: {
  teamSlug: string;
  projectId: Id<"projects">;
}) {
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;

  const { context, resolvedProjectId, resolvedTeamSlug, project, videos } =
    useProjectData({ teamSlug, projectId });
  const projectPresenceCounts = useQuery(
    api.videoPresence.listProjectOnlineCounts,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const { requestUpload } =
    useDashboardUploadContext();
  const deleteVideo = useMutation(api.videos.remove);
  const updateVideo = useMutation(api.videos.update);
  const updateVideoWorkflowStatus = useMutation(api.videos.updateWorkflowStatus);
  const setProjectNotionPage = useMutation(api.projects.setNotionPage);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);
  const searchNotionPages = useAction(api.notionActions.searchPagesForProject);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [shareToast, setShareToast] = useState<ShareToastState | null>(null);
  const [projectShareDialogOpen, setProjectShareDialogOpen] = useState(false);
  const [notionDialogOpen, setNotionDialogOpen] = useState(false);
  const [notionInput, setNotionInput] = useState("");
  const [notionSearchQuery, setNotionSearchQuery] = useState("");
  const [notionSearchResults, setNotionSearchResults] = useState<NotionSearchResult[]>([]);
  const [isSearchingNotion, setIsSearchingNotion] = useState(false);
  const [notionSearchReason, setNotionSearchReason] = useState<string | null>(null);
  const [isSavingNotionLink, setIsSavingNotionLink] = useState(false);
  const shareToastTimeoutRef = useRef<number | null>(null);
  const notionSearchRequestRef = useRef(0);

  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  useEffect(
    () => () => {
      if (shareToastTimeoutRef.current !== null) {
        window.clearTimeout(shareToastTimeoutRef.current);
      }
    },
    [],
  );

  const isLoadingData =
    context === undefined ||
    project === undefined ||
    videos === undefined ||
    shouldCanonicalize;

  useEffect(() => {
    if (!project) return;
    setNotionInput(project.notionPageUrl ?? project.notionPageId ?? "");
  }, [project?._id, project?.notionPageId, project?.notionPageUrl]);

  useEffect(() => {
    if (!notionDialogOpen || !project) return;
    setNotionSearchQuery(project.name ?? "");
    setNotionSearchReason(null);
    setNotionSearchResults([]);
  }, [notionDialogOpen, project?._id, project?.name]);

  useEffect(() => {
    if (!notionDialogOpen || !project) return;

    const query = notionSearchQuery.trim();
    if (query.length < 2) {
      setNotionSearchResults([]);
      setNotionSearchReason(null);
      setIsSearchingNotion(false);
      return;
    }

    const requestId = notionSearchRequestRef.current + 1;
    notionSearchRequestRef.current = requestId;

    const timeoutId = window.setTimeout(() => {
      setIsSearchingNotion(true);
      void searchNotionPages({
        projectId: project._id,
        query,
        limit: 8,
      })
        .then((response) => {
          if (notionSearchRequestRef.current !== requestId) return;
          setNotionSearchResults(response.results);
          setNotionSearchReason(response.reason ?? null);
        })
        .catch((error) => {
          if (notionSearchRequestRef.current !== requestId) return;
          console.error("Failed to search Notion pages:", error);
          setNotionSearchResults([]);
          setNotionSearchReason("search_failed");
        })
        .finally(() => {
          if (notionSearchRequestRef.current !== requestId) return;
          setIsSearchingNotion(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notionDialogOpen, notionSearchQuery, project, searchNotionPages]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!resolvedProjectId) return;
      requestUpload(files, resolvedProjectId);
    },
    [requestUpload, resolvedProjectId],
  );

  const handleDeleteVideo = async (videoId: Id<"videos">) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      await deleteVideo({ videoId });
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  const handleEditVideoTitle = useCallback(
    async (videoId: Id<"videos">, currentTitle: string) => {
      const nextTitle = window.prompt("Edit video title", currentTitle);
      if (nextTitle === null) return;
      const trimmed = nextTitle.trim();
      if (!trimmed || trimmed === currentTitle) return;
      try {
        await updateVideo({ videoId, title: trimmed });
      } catch (error) {
        console.error("Failed to update video title:", error);
      }
    },
    [updateVideo],
  );

  const handleDownloadVideo = useCallback(
    async (videoId: Id<"videos">, title: string) => {
      try {
        const result = await getDownloadUrl({ videoId });
        if (result?.url) {
          triggerDownload(result.url, result.filename ?? `${title}.mp4`);
        }
      } catch (error) {
        console.error("Failed to download video:", error);
      }
    },
    [getDownloadUrl],
  );

  const handleUpdateWorkflowStatus = useCallback(
    async (videoId: Id<"videos">, workflowStatus: VideoWorkflowStatus) => {
      try {
        await updateVideoWorkflowStatus({ videoId, workflowStatus });
      } catch (error) {
        console.error("Failed to update video workflow status:", error);
      }
    },
    [updateVideoWorkflowStatus],
  );

  const showShareToast = useCallback((tone: ShareToastState["tone"], message: string) => {
    setShareToast({ tone, message });
    if (shareToastTimeoutRef.current !== null) {
      window.clearTimeout(shareToastTimeoutRef.current);
    }
    shareToastTimeoutRef.current = window.setTimeout(() => {
      setShareToast(null);
      shareToastTimeoutRef.current = null;
    }, 2400);
  }, []);

  const notionPageUrl = project?.notionPageUrl
    ?? (project?.notionPageId
      ? `https://www.notion.so/${project.notionPageId.replace(/-/g, "")}`
      : null);

  const handleSaveNotionLink = useCallback(async () => {
    if (!project) return;
    setIsSavingNotionLink(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const result = await setProjectNotionPage({
        projectId: project._id,
        notionPageInput: notionInput,
        projectUrl: origin
          ? `${origin}${projectPath(resolvedTeamSlug, project._id)}`
          : undefined,
      });
      setNotionInput(result.notionPageUrl ?? result.notionPageId ?? "");
      setNotionDialogOpen(false);
      showShareToast(
        "success",
        result.notionPageId ? "Notion page linked" : "Notion link removed",
      );
    } catch (error) {
      console.error("Failed to save Notion link:", error);
      showShareToast("error", "Could not save Notion link");
    } finally {
      setIsSavingNotionLink(false);
    }
  }, [
    notionInput,
    project,
    resolvedTeamSlug,
    setProjectNotionPage,
    showShareToast,
  ]);

  const handleClearNotionLink = useCallback(async () => {
    if (!project) return;
    setIsSavingNotionLink(true);
    try {
      await setProjectNotionPage({
        projectId: project._id,
        notionPageInput: "",
      });
      setNotionInput("");
      setNotionDialogOpen(false);
      showShareToast("success", "Notion link removed");
    } catch (error) {
      console.error("Failed to clear Notion link:", error);
      showShareToast("error", "Could not remove Notion link");
    } finally {
      setIsSavingNotionLink(false);
    }
  }, [project, setProjectNotionPage, showShareToast]);

  const handleShareVideo = useCallback(
    async (video: {
      _id: Id<"videos">;
      publicId?: string;
      status: string;
      visibility: "public" | "private";
    }) => {
      const canSharePublicly =
        Boolean(video.publicId) &&
        video.status === "ready" &&
        video.visibility === "public";
      const path = canSharePublicly
        ? `/watch/${video.publicId}`
        : videoPath(resolvedTeamSlug, projectId, video._id);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}${path}`;

      try {
        const copied = await copyTextToClipboard(url);
        if (!copied) {
          showShareToast("error", "Could not copy link");
          return;
        }
        showShareToast(
          "success",
          canSharePublicly
            ? "Share link copied"
            : "Video link copied (public watch link not available yet)",
        );
      } catch {
        showShareToast("error", "Could not copy link");
      }
    },
    [projectId, resolvedTeamSlug, showShareToast],
  );

  // Not found state
  if (context === null || project === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#888]">Project not found</div>
      </div>
    );
  }

  const canUpload = project?.role !== "viewer";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[
        { label: project?.name ?? "\u00A0" }
      ]} teamId={context?.team._id} teamSlug={resolvedTeamSlug}>
        <div className={cn(
          "flex items-center gap-2 transition-opacity duration-300 flex-shrink-0",
          isLoadingData ? "opacity-0" : "opacity-100"
        )}>
          {/* View toggle */}
          <div className="flex items-center border-2 border-[#1a1a1a] p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-[#1a1a1a] text-[#f0f0e8]"
                  : "text-[#888] hover:text-[#1a1a1a]",
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-[#1a1a1a] text-[#f0f0e8]"
                  : "text-[#888] hover:text-[#1a1a1a]",
              )}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
          {canUpload && (
            <>
              <Button
                onClick={() => setProjectShareDialogOpen(true)}
              >
                <Share2 className="h-3.5 w-3.5 mr-1.5" />
                Share Project
              </Button>
              <UploadButton onFilesSelected={handleFilesSelected} />
              {notionPageUrl ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => window.open(notionPageUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open Notion
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    disabled={isSavingNotionLink}
                    onClick={() => void handleClearNotionLink()}
                    title="Remove Notion link"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setNotionDialogOpen(true)}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Link Notion
                </Button>
              )}
            </>
          )}
          {!canUpload && notionPageUrl ? (
            <Button
              variant="outline"
              onClick={() => window.open(notionPageUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open Notion
            </Button>
          ) : null}
        </div>
      </DashboardHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!isLoadingData && videos.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 animate-in fade-in duration-300">
            <DropZone
              onFilesSelected={handleFilesSelected}
              disabled={!canUpload}
              className="max-w-xl w-full"
            />
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View - Responsive tiles */
          <div className={cn(
            "p-6 transition-opacity duration-300",
            isLoadingData ? "opacity-0" : "opacity-100"
          )}>
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {videos?.map((video) => {
                const thumbnailSrc = video.thumbnailUrl?.startsWith("http")
                  ? video.thumbnailUrl
                  : undefined;
                const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
                const watchingCount =
                  projectPresenceCounts?.counts?.[video._id] ?? 0;

                return (
                  <VideoIntentTarget
                    key={video._id}
                    className="group cursor-pointer flex flex-col"
                    teamSlug={resolvedTeamSlug}
                    projectId={project._id}
                    videoId={video._id}
                    muxPlaybackId={video.muxPlaybackId}
                    onOpen={() =>
                      navigate({
                        to: videoPath(resolvedTeamSlug, project._id, video._id),
                      })
                    }
                  >
                    <div className="relative aspect-video bg-[#e8e8e0] overflow-hidden border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all">
                      {thumbnailSrc ? (
                        <img
                          src={thumbnailSrc}
                          alt={video.title}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="h-10 w-10 text-[#888]" />
                        </div>
                      )}
                    {video.status === "ready" && video.duration && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-mono px-1.5 py-0.5">
                        {formatDuration(video.duration)}
                      </div>
                    )}
                    {video.status !== "ready" && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white text-xs font-bold uppercase tracking-wider">
                          {video.status === "uploading" && "Uploading..."}
                          {video.status === "processing" && "Processing..."}
                          {video.status === "failed" && "Failed"}
                        </span>
                      </div>
                    )}
                    {/* Hover menu */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center bg-black/60 hover:bg-black/80 text-white"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleEditVideoTitle(video._id, video.title);
                            }}
                          >
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {canDownload && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownloadVideo(
                                  video._id,
                                  video.title,
                                );
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleShareVideo(video);
                            }}
                          >
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Share
                          </DropdownMenuItem>
                          {canUpload && (
                            <DropdownMenuItem
                              className="text-[#dc2626] focus:text-[#dc2626]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVideo(video._id);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="text-[15px] text-[#1a1a1a] font-black truncate leading-tight">
                      {video.title}
                    </p>
                    {video.isFinalProof && (
                      <span className="mt-1 inline-flex items-center border-2 border-[#1a1a1a] bg-[#fff3bf] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1a1a1a]">
                        Final Proof
                      </span>
                    )}
                    <div className="mt-1.5 flex items-center gap-3">
                      <VideoWorkflowStatusControl
                        status={video.workflowStatus}
                        stopPropagation
                        disabled={!canUpload}
                        onChange={(workflowStatus) =>
                          void handleUpdateWorkflowStatus(video._id, workflowStatus)
                        }
                      />
                      {video.commentCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#888]">
                          <MessageSquare className="h-3 w-3" />
                          {video.commentCount}
                        </span>
                      )}
                      {watchingCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#1a1a1a]">
                          <Eye className="h-3 w-3" />
                          {watchingCount}
                        </span>
                      )}
                      <span className="text-[11px] text-[#888] ml-auto font-mono">
                        {formatRelativeTime(video._creationTime)}
                      </span>
                    </div>
                  </div>
                  </VideoIntentTarget>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View - Horizontal rows */
          <div className={cn(
            "divide-y-2 divide-[#1a1a1a] transition-opacity duration-300",
            isLoadingData ? "opacity-0" : "opacity-100"
          )}>
            {videos?.map((video) => {
              const thumbnailSrc = video.thumbnailUrl?.startsWith("http")
                ? video.thumbnailUrl
                : undefined;
              const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
              const watchingCount =
                projectPresenceCounts?.counts?.[video._id] ?? 0;

              return (
                <VideoIntentTarget
                  key={video._id}
                  className="group flex items-center gap-5 px-6 py-3 hover:bg-[#e8e8e0] cursor-pointer transition-colors"
                  teamSlug={resolvedTeamSlug}
                  projectId={project._id}
                  videoId={video._id}
                  muxPlaybackId={video.muxPlaybackId}
                  onOpen={() =>
                    navigate({
                      to: videoPath(resolvedTeamSlug, project._id, video._id),
                    })
                  }
                >
                  {/* Thumbnail */}
                  <div className="relative w-44 aspect-video bg-[#e8e8e0] overflow-hidden border-2 border-[#1a1a1a] shrink-0 shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all">
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt={video.title}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-6 w-6 text-[#888]" />
                      </div>
                    )}
                    {video.status !== "ready" && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold uppercase tracking-wider">
                          {video.status === "uploading" && "Uploading..."}
                          {video.status === "processing" && "Processing..."}
                          {video.status === "failed" && "Failed"}
                        </span>
                      </div>
                    )}
                    {video.status === "ready" && video.duration && (
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-mono px-1 py-0.5">
                        {formatDuration(video.duration)}
                      </div>
                    )}
                  </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[#1a1a1a] truncate">
                    {video.title}
                  </p>
                  {video.isFinalProof && (
                    <span className="mt-1 inline-flex items-center border-2 border-[#1a1a1a] bg-[#fff3bf] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1a1a1a]">
                      Final Proof
                    </span>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <VideoWorkflowStatusControl
                      status={video.workflowStatus}
                      stopPropagation
                      disabled={!canUpload}
                      onChange={(workflowStatus) =>
                        void handleUpdateWorkflowStatus(video._id, workflowStatus)
                      }
                    />
                    {video.commentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[#888]">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {video.commentCount}
                      </span>
                    )}
                    {watchingCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[#1a1a1a]">
                        <Eye className="h-3.5 w-3.5" />
                        {watchingCount}
                      </span>
                    )}
                    <span className="text-xs text-[#888] font-mono">
                      {formatRelativeTime(video._creationTime)}
                    </span>
                    {video.uploaderName && (
                      <span className="text-xs text-[#888]">
                        {video.uploaderName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-[#888] hover:text-[#1a1a1a]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleEditVideoTitle(video._id, video.title);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {canDownload && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDownloadVideo(video._id, video.title);
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleShareVideo(video);
                        }}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      {canUpload && (
                        <DropdownMenuItem
                          className="text-[#dc2626] focus:text-[#dc2626]"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVideo(video._id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </VideoIntentTarget>
              );
            })}
          </div>
        )}
      </div>

      {resolvedProjectId ? (
        <ProjectShareDialog
          projectId={resolvedProjectId}
          open={projectShareDialogOpen}
          onOpenChange={setProjectShareDialogOpen}
        />
      ) : null}

      <Dialog open={notionDialogOpen} onOpenChange={setNotionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Notion page</DialogTitle>
            <DialogDescription>
              Search your Notion pages or paste a page URL/ID.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="https://www.notion.so/... or page ID"
              value={notionInput}
              onChange={(event) => setNotionInput(event.target.value)}
            />
            <div className="border-2 border-[#1a1a1a] bg-[#e8e8e0]">
              <div className="border-b-2 border-[#1a1a1a] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
                  <Input
                    value={notionSearchQuery}
                    onChange={(event) => setNotionSearchQuery(event.target.value)}
                    className="pl-8"
                    placeholder="Search Notion pages..."
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {isSearchingNotion ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-[#888]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching Notion...
                  </div>
                ) : notionSearchQuery.trim().length < 2 ? (
                  <p className="px-3 py-4 text-sm text-[#888]">
                    Type at least 2 characters to search.
                  </p>
                ) : notionSearchResults.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[#888]">
                    {notionSearchReason === "missing_notion_api_key"
                      ? "Notion API key is not configured."
                      : "No matching Notion pages found."}
                  </p>
                ) : (
                  notionSearchResults.map((result) => {
                    const editedAt = result.lastEditedTime
                      ? Date.parse(result.lastEditedTime)
                      : Number.NaN;
                    return (
                      <button
                        key={result.pageId}
                        type="button"
                        className="w-full border-b border-[#1a1a1a]/20 px-3 py-2 text-left hover:bg-[#f0f0e8]"
                        onClick={() => setNotionInput(result.url)}
                      >
                        <p className="truncate text-sm font-bold text-[#1a1a1a]">
                          {result.title}
                        </p>
                        <p className="truncate text-xs text-[#888]">{result.url}</p>
                        {!Number.isNaN(editedAt) ? (
                          <p className="text-[10px] text-[#888]">
                            Updated {formatRelativeTime(editedAt)}
                          </p>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNotionDialogOpen(false)}
            >
              Cancel
            </Button>
            {project?.notionPageId ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isSavingNotionLink}
                onClick={() => void handleClearNotionLink()}
              >
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={isSavingNotionLink}
              onClick={() => void handleSaveNotionLink()}
            >
              {isSavingNotionLink ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shareToast ? (
        <div className="fixed right-4 top-4 z-50" aria-live="polite">
          <div
            className={cn(
              "border-2 px-3 py-2 text-sm font-bold shadow-[4px_4px_0px_0px_var(--shadow-color)]",
              shareToast.tone === "success"
                ? "border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a]"
                : "border-[#dc2626] bg-[#fef2f2] text-[#dc2626]",
            )}
          >
            {shareToast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
