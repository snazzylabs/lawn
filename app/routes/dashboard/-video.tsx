
import { useConvex, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player/VideoPlayer";
import { DrawingCanvas, type DrawingCanvasHandle, type DrawingTool } from "@/components/video-player/DrawingCanvas";
import { DrawingToolbar } from "@/components/video-player/DrawingToolbar";
import { CommentList } from "@/components/comments/CommentList";
import { CommentInput } from "@/components/comments/CommentInput";
import { ShareDialog } from "@/components/ShareDialog";
import { HelpButton } from "@/components/HelpDialog";
import {
  VideoWorkflowStatusControl,
  type VideoWorkflowStatus,
} from "@/components/videos/VideoWorkflowStatusControl";
import { formatDuration } from "@/lib/utils";
import { compositeDrawingOnFrame } from "@/lib/compositeDrawing";
import { downloadFCPXML, downloadPremiereCSV, downloadDaVinciEDL } from "@/lib/nleExport";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { DashboardHeader } from "@/components/DashboardHeader";
import { resolveAttachmentContentType } from "@/lib/attachments";
import {
  ATTACH_COMMENT_FILES_EVENT,
  OPEN_HELP_EVENT,
  focusVisibleCommentInputSoon,
  isTextEntryTarget,
} from "@/lib/commentHotkeys";
import {
  Edit2,
  Check,
  X,
  Link as LinkIcon,
  MessageSquare,
  MoreVertical,
  Download,
  CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "@convex/_generated/dataModel";
import { projectPath } from "@/lib/routes";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmProject } from "./-project.data";
import { useVideoData } from "./-video.data";

export default function VideoPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";
  const projectId = params.projectId as Id<"projects">;
  const videoId = params.videoId as Id<"videos">;
  const convex = useConvex();

  const {
    context,
    resolvedTeamSlug,
    resolvedProjectId,
    resolvedVideoId,
    video,
    comments,
    commentsThreaded,
  } = useVideoData({
    teamSlug,
    projectId,
    videoId,
  });
  const updateVideo = useMutation(api.videos.update);
  const createComment = useMutation(api.comments.create);
  const createAttachment = useMutation(api.comments.createAttachment);
  const updateVideoWorkflowStatus = useMutation(api.videos.updateWorkflowStatus);
  const approveFinalCut = useMutation(api.videos.approveFinalCut);
  const getPlaybackSession = useAction(api.videoActions.getPlaybackSession);
  const getOriginalPlaybackUrl = useAction(api.videoActions.getOriginalPlaybackUrl);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);
  const getAttachmentUploadUrl = useAction(api.videoActions.getAttachmentUploadUrl);

  const [currentTime, setCurrentTime] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [highlightedCommentId, setHighlightedCommentId] = useState<Id<"comments"> | undefined>();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [showDiscussionForFinalCut, setShowDiscussionForFinalCut] = useState(false);
  const [isApprovingFinalCut, setIsApprovingFinalCut] = useState(false);
  const [playbackSession, setPlaybackSession] = useState<{
    url: string;
    posterUrl: string;
    spriteVttUrl?: string;
  } | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [originalPlaybackUrl, setOriginalPlaybackUrl] = useState<string | null>(null);
  const [isLoadingOriginalPlayback, setIsLoadingOriginalPlayback] = useState(false);
  const [preferredSource, setPreferredSource] = useState<"mux720" | "original" | null>(null);
  const [rangeMarker, setRangeMarker] = useState<{ inTime: number; outTime: number } | null>(null);
  const [pendingInPoint, setPendingInPoint] = useState<number | null>(null);
  const [editingMarker, setEditingMarker] = useState<{ timestampSeconds: number } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<Id<"comments"> | null>(null);
  const [visibleCommentIds, setVisibleCommentIds] = useState<Set<string>>(new Set());
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingData, setDrawingData] = useState<string | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen");
  const [drawingColor, setDrawingColor] = useState("#ef4444");
  const drawingCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const currentTimeRef = useRef(0);
  const pendingInTimeRef = useRef<number | null>(null);
  const canComment = true;

  useEffect(() => {
    const dragEventHasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragOver = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();

      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;

      if (window.matchMedia("(max-width: 1023px)").matches) {
        setMobileCommentsOpen(true);
      }

      window.dispatchEvent(
        new CustomEvent(ATTACH_COMMENT_FILES_EVENT, {
          detail: { files },
        }),
      );
      focusVisibleCommentInputSoon();
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const timelineComments = useMemo(() => {
    if (!comments) return [];
    if (visibleCommentIds.size === 0) return comments;
    return comments.filter((c) => visibleCommentIds.has(c._id as string));
  }, [comments, visibleCommentIds]);

  const isPlayable = video?.status === "ready" && (Boolean(video?.muxPlaybackId) || Boolean(video?.hlsKey));
  const playbackUrl = playbackSession?.url ?? null;
  const effectiveSource = preferredSource
    ?? (video?.hlsKey && playbackUrl ? "mux720" : "original");
  const activePlaybackUrl =
    effectiveSource === "mux720"
      ? playbackUrl ?? originalPlaybackUrl
      : originalPlaybackUrl ?? playbackUrl;
  const activeQualityId =
    activePlaybackUrl && playbackUrl && activePlaybackUrl === playbackUrl
      ? "mux720"
      : "original";
  const isUsingOriginalFallback = Boolean(activePlaybackUrl && activePlaybackUrl === originalPlaybackUrl && !playbackUrl);
  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;
  const isFinalCutVideo = Boolean(video?.isFinalProof);
  const isDiscussionVisible = !isFinalCutVideo || showDiscussionForFinalCut;
  const prewarmProjectIntentHandlers = useRoutePrewarmIntent(() => {
    if (!resolvedProjectId) return;
    return prewarmProject(convex, {
      teamSlug: resolvedTeamSlug,
      projectId: resolvedProjectId,
    });
  });
  const { watchers } = useVideoPresence({
    videoId: resolvedVideoId,
    enabled: Boolean(resolvedVideoId),
  });

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (!canComment) return;
        if (window.matchMedia("(max-width: 1023px)").matches) {
          setMobileCommentsOpen(true);
        }
        focusVisibleCommentInputSoon();
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        playerRef.current?.togglePlay();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_HELP_EVENT));
        return;
      }

      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        const time = currentTimeRef.current;
        pendingInTimeRef.current = time;
        setPendingInPoint(time);
        setRangeMarker(null);
        return;
      }

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        const outTime = currentTimeRef.current;
        const pendingIn = pendingInTimeRef.current;
        const start = pendingIn ?? Math.max(0, outTime - 5);
        setRangeMarker({
          inTime: Math.min(start, outTime),
          outTime: Math.max(start, outTime),
        });
        setPendingInPoint(null);
        pendingInTimeRef.current = null;
        focusVisibleCommentInputSoon();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canComment]);

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  useEffect(() => {
    if (!isFinalCutVideo) {
      setShowDiscussionForFinalCut(false);
      setMobileCommentsOpen(false);
      return;
    }
    if (!showDiscussionForFinalCut) {
      setMobileCommentsOpen(false);
    }
  }, [isFinalCutVideo, showDiscussionForFinalCut, resolvedVideoId]);

  useEffect(() => {
    if (!resolvedVideoId || !isPlayable) {
      setPlaybackSession(null);
      setIsLoadingPlayback(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPlayback(true);

    void getPlaybackSession({ videoId: resolvedVideoId })
      .then((session) => {
        if (cancelled) return;
        setPlaybackSession(session);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackSession(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getPlaybackSession, isPlayable, resolvedVideoId, video?.muxPlaybackId, video?.hlsKey]);

  useEffect(() => {
    if (!resolvedVideoId || !video || video.status === "uploading" || video.status === "failed") {
      setOriginalPlaybackUrl(null);
      setIsLoadingOriginalPlayback(false);
      return;
    }

    let cancelled = false;
    setIsLoadingOriginalPlayback(true);

    void getOriginalPlaybackUrl({ videoId: resolvedVideoId })
      .then((result) => {
        if (cancelled) return;
        setOriginalPlaybackUrl(result.url);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalPlaybackUrl(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingOriginalPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getOriginalPlaybackUrl, resolvedVideoId, video?.status, video?.s3Key]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleMarkerClick = useCallback((comment: { _id: string }) => {
    setHighlightedCommentId(comment._id as Id<"comments">);
    setTimeout(() => setHighlightedCommentId(undefined), 3000);
  }, []);

  const requestDownload = useCallback(async () => {
    if (!video || video.status !== "ready" || !resolvedVideoId) return null;
    try {
      const result = await getDownloadUrl({ videoId: resolvedVideoId });
      return result;
    } catch (error) {
      console.error("Failed to prepare download:", error);
      return null;
    }
  }, [getDownloadUrl, video, resolvedVideoId]);

  const handleTimestampClick = useCallback(
    (time: number) => {
      playerRef.current?.seekTo(time);
      setHighlightedCommentId(undefined);
    },
    [playerRef, setHighlightedCommentId]
  );

  const prepareDrawingForComment = useCallback(
    async (draft?: string | null) => {
      if (draft) return draft;
      const canvas = drawingCanvasRef.current;
      if (!canvas || canvas.getStrokes().length === 0) return drawingData;

      const rawDrawing = canvas.toDataURL();
      if (!rawDrawing) return null;

      const frame = playerRef.current
        ? await playerRef.current.captureFrameWithFallback()
        : null;
      if (!frame) return rawDrawing;

      try {
        return await compositeDrawingOnFrame(frame, rawDrawing);
      } catch {
        return rawDrawing;
      }
    },
    [drawingData],
  );

  const handleSubmitComment = useCallback(
    async (args: {
      text: string;
      timestampSeconds: number;
      endTimestampSeconds?: number;
      drawingData?: string;
      parentId?: Id<"comments">;
      files?: File[];
    }) => {
      if (!resolvedVideoId) return;
      const preparedDrawing = await prepareDrawingForComment(args.drawingData ?? null);

      const commentId = await createComment({
        videoId: resolvedVideoId,
        text: args.text,
        timestampSeconds: args.timestampSeconds,
        endTimestampSeconds: args.endTimestampSeconds,
        drawingData: preparedDrawing ?? undefined,
        parentId: args.parentId,
      });

      if (args.files?.length && commentId) {
        await Promise.all(
          args.files.map(async (file) => {
            const contentType = resolveAttachmentContentType(file);
            const { url, s3Key } = await getAttachmentUploadUrl({
              commentId,
              filename: file.name,
              fileSize: file.size,
              contentType,
            });
            const uploadResponse = await fetch(url, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": contentType },
            });
            if (!uploadResponse.ok) {
              throw new Error("Attachment upload failed");
            }
            await createAttachment({
              commentId,
              s3Key,
              filename: file.name,
              fileSize: file.size,
              contentType,
            });
          }),
        );
      }

      setDrawingData(null);
      setDrawingMode(false);
      setRangeMarker(null);
      setPendingInPoint(null);
      pendingInTimeRef.current = null;

      const activeElement = document.activeElement;
      if (isTextEntryTarget(activeElement) && activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
      playerRef.current?.play();
    },
    [
      createAttachment,
      createComment,
      getAttachmentUploadUrl,
      prepareDrawingForComment,
      resolvedVideoId,
    ],
  );

  const handleEditingChange = useCallback(
    (editing: { commentId: Id<"comments">; timestamp: number; endTimestamp?: number } | null) => {
      if (editing) {
        setEditingCommentId(editing.commentId);
        if (editing.endTimestamp !== undefined) {
          setRangeMarker({ inTime: editing.timestamp, outTime: editing.endTimestamp });
          setEditingMarker(null);
        } else {
          setEditingMarker({ timestampSeconds: editing.timestamp });
          setRangeMarker(null);
        }
        setPendingInPoint(null);
        pendingInTimeRef.current = null;
      } else {
        setEditingCommentId(null);
        setEditingMarker(null);
        setRangeMarker(null);
        setPendingInPoint(null);
        pendingInTimeRef.current = null;
      }
    },
    [],
  );

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !video || !resolvedVideoId) return;
    try {
      await updateVideo({ videoId: resolvedVideoId, title: editedTitle.trim() });
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  const handleUpdateWorkflowStatus = useCallback(
    async (workflowStatus: VideoWorkflowStatus) => {
      if (!resolvedVideoId) return;
      try {
        await updateVideoWorkflowStatus({ videoId: resolvedVideoId, workflowStatus });
      } catch (error) {
        console.error("Failed to update review status:", error);
      }
    },
    [resolvedVideoId, updateVideoWorkflowStatus],
  );

  const handleApproveFinalCut = useCallback(async () => {
    if (!resolvedVideoId || isApprovingFinalCut) return;
    setIsApprovingFinalCut(true);
    try {
      await approveFinalCut({ videoId: resolvedVideoId });
    } catch (error) {
      console.error("Failed to approve final cut:", error);
    } finally {
      setIsApprovingFinalCut(false);
    }
  }, [approveFinalCut, isApprovingFinalCut, resolvedVideoId]);

  const startEditingTitle = () => {
    if (video) {
      setEditedTitle(video.title);
      setIsEditingTitle(true);
    }
  };

  if (context === undefined || video === undefined || shouldCanonicalize) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#888]">Loading...</div>
      </div>
    );
  }

  if (context === null || video === null || !resolvedProjectId || !resolvedVideoId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#888]">Video not found</div>
      </div>
    );
  }

  const canEdit = video.role !== "viewer";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[
        {
          label: context?.project?.name ?? "project",
          href: projectPath(resolvedTeamSlug, resolvedProjectId),
          prewarmIntentHandlers: prewarmProjectIntentHandlers,
        },
        { 
          label: isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-40 sm:w-64 h-8 text-base font-black tracking-tighter uppercase font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsEditingTitle(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate max-w-[150px] sm:max-w-[300px]">{video.title}</span>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={startEditingTitle}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
              {video.status !== "ready" && (
                <Badge
                  variant={video.status === "failed" ? "destructive" : "secondary"}
                >
                  {video.status === "uploading" && "Uploading"}
                  {video.status === "processing" && "Processing"}
                  {video.status === "failed" && "Failed"}
                </Badge>
              )}
            </div>
          )
        }
      ]} teamId={context?.team._id} teamSlug={resolvedTeamSlug}>
        {/* Desktop: inline actions */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-[#888]">
          <span className="truncate max-w-[100px]">{video.uploaderName}</span>
          {video.duration && (
            <>
              <span className="text-[#ccc]">·</span>
              <span className="font-mono">{formatDuration(video.duration)}</span>
            </>
          )}
          <VideoWatchers watchers={watchers} />
        </div>
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0 border-l-2 border-[#1a1a1a]/20 pl-3 ml-1">
          <VideoWorkflowStatusControl
            status={video.workflowStatus}
            size="lg"
            disabled={!canEdit}
            onChange={(workflowStatus) => {
              void handleUpdateWorkflowStatus(workflowStatus);
            }}
          />
          <Button variant="outline" onClick={() => setShareDialogOpen(true)}>
            <LinkIcon className="mr-1.5 h-4 w-4" />
            Share
          </Button>
          <HelpButton variant="outline" className="h-9 w-9" />
          {isDiscussionVisible && (
            <Button
              variant="outline"
              className="lg:hidden"
              onClick={() => setMobileCommentsOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              {comments && comments.length > 0 && (
                <span className="ml-1 text-xs">{comments.length}</span>
              )}
            </Button>
          )}
        </div>

        {/* Mobile: workflow status + menu button */}
        <div className="flex sm:hidden items-center gap-2">
          <VideoWorkflowStatusControl
            status={video.workflowStatus}
            size="lg"
            disabled={!canEdit}
            onChange={(workflowStatus) => {
              void handleUpdateWorkflowStatus(workflowStatus);
            }}
          />
          <HelpButton variant="outline" className="h-9 w-9" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setShareDialogOpen(true)}>
              <LinkIcon className="mr-2 h-4 w-4" />
              Share
            </DropdownMenuItem>
            {isDiscussionVisible && (
              <DropdownMenuItem onSelect={() => setMobileCommentsOpen(true)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}
              </DropdownMenuItem>
            )}
            {comments && comments.length > 0 && (
              <>
                <DropdownMenuItem onSelect={() => downloadFCPXML(comments, video?.title ?? "video")}>
                  <Download className="mr-2 h-4 w-4" />
                  Export FCPXML
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadPremiereCSV(comments, video?.title ?? "video")}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Premiere CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadDaVinciEDL(comments, video?.title ?? "video")}>
                  <Download className="mr-2 h-4 w-4" />
                  Export DaVinci EDL
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DashboardHeader>

      {video.isFinalProof && (
        <div className="border-b border-amber-700/35 bg-amber-100 text-amber-950 dark:border-amber-300/30 dark:bg-amber-900/30 dark:text-amber-100 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-900 dark:text-amber-100">
                Final Proof
              </p>
              <p className="text-sm text-amber-900/90 dark:text-amber-100/90">
                {video.finalCutApprovedAt
                  ? `Approved by ${video.finalCutApprovedByName ?? "team"} and ready for publishing.`
                  : "We hope you like our changes! Approve to notify team for publishing."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isDiscussionVisible && (
                <Button
                  variant="outline"
                  className="h-11 border border-amber-900/35 bg-white/85 px-5 text-sm font-black uppercase tracking-wide text-amber-900 hover:bg-white dark:border-amber-200/35 dark:bg-black/25 dark:text-amber-100 dark:hover:bg-black/35"
                  onClick={() => setShowDiscussionForFinalCut(true)}
                >
                  Edits Required
                </Button>
              )}
              {video.finalCutApprovedAt ? (
                <span className="inline-flex items-center gap-2 border border-emerald-200/50 bg-emerald-600 px-3 py-2 text-sm font-black uppercase tracking-wide text-white">
                  <CheckCircle2 className="h-4 w-4" />
                  Final Cut Approved
                </span>
              ) : (
                <Button
                  onClick={() => void handleApproveFinalCut()}
                  disabled={isApprovingFinalCut}
                  className="h-11 border border-emerald-200/50 bg-emerald-600 px-5 text-sm font-black uppercase tracking-wide text-white shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:bg-emerald-500"
                >
                  {isApprovingFinalCut ? "Approving..." : "Approve Final Cut"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content - horizontal split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area — full black, Frame.io style */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-black">
          {video.status === "processing" && isUsingOriginalFallback && activePlaybackUrl ? (
            <div className="flex-shrink-0 flex items-center gap-2 border-b border-zinc-700/70 bg-zinc-900/95 px-4 py-2 text-sm text-zinc-100">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[#2F6DB4]" />
              <span className="font-semibold">Original playback active.</span>
              <span className="text-zinc-300">Transcoded stream is still encoding.</span>
            </div>
          ) : null}

          {activePlaybackUrl ? (
            <div className="relative flex-1 min-h-0">
              <VideoPlayer
                ref={playerRef}
                src={activePlaybackUrl}
                poster={playbackSession?.posterUrl}
                spriteVttUrl={playbackSession?.spriteVttUrl}
                comments={timelineComments}
                onTimeUpdate={handleTimeUpdate}
                onMarkerClick={handleMarkerClick}
                allowDownload={video.status === "ready"}
                downloadFilename={`${video.title}.mp4`}
                onRequestDownload={requestDownload}
                controlsBelow
                editingMarker={editingMarker ?? undefined}
                onEditingMarkerDrag={(time) => {
                  setEditingMarker({ timestampSeconds: time });
                }}
                rangeMarker={rangeMarker ?? undefined}
                pendingInPoint={pendingInPoint ?? undefined}
                onRangeMarkerDrag={(handle, time) => {
                  setRangeMarker((prev) => prev ? {
                    inTime: handle === "in" ? time : prev.inTime,
                    outTime: handle === "out" ? time : prev.outTime,
                  } : null);
                }}
                qualityOptionsConfig={[
                  ...(video?.hlsKey
                    ? activeQualityId !== "mux720"
                      ? [{ id: "mux720", label: "Adaptive", disabled: !playbackUrl }]
                      : []
                    : [
                        {
                          id: "mux720",
                          label: playbackUrl ? "720p" : "720p (encoding...)",
                          disabled: !playbackUrl,
                        },
                      ]),
                  {
                    id: "original",
                    label: "Original",
                    disabled: !originalPlaybackUrl,
                  },
                ]}
                selectedQualityId={activeQualityId}
                onSelectQuality={(id) => {
                  if (id === "mux720" || id === "original") {
                    setPreferredSource(id);
                  }
                }}
              />
              {drawingMode && (
                <>
                  <DrawingCanvas
                    ref={drawingCanvasRef}
                    tool={drawingTool}
                    color={drawingColor}
                    lineWidth={3}
                    active
                    className="z-30"
                  />
                  <DrawingToolbar
                    tool={drawingTool}
                    color={drawingColor}
                    onToolChange={setDrawingTool}
                    onColorChange={setDrawingColor}
                    onUndo={() => drawingCanvasRef.current?.undo()}
                    onClear={() => drawingCanvasRef.current?.clear()}
                    onCancel={() => setDrawingMode(false)}
                    onDone={async () => {
                      const preparedDrawing = await prepareDrawingForComment();
                      setDrawingData(preparedDrawing);
                      setDrawingMode(false);
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              {video.status === "ready" && !playbackUrl ? (
                <div className="flex flex-col items-center gap-3 text-white">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                  <p className="text-sm font-medium text-white/85">
                    {isLoadingPlayback ? "Loading stream..." : "Preparing stream..."}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  {video.status === "uploading" && (
                    <p className="text-white/60">Uploading...</p>
                  )}
                  {video.status === "processing" && (
                    <p className="text-white/60">
                      {isLoadingOriginalPlayback
                        ? "Preparing original playback..."
                        : "Processing video..."}
                    </p>
                  )}
                  {video.status === "failed" && (
                    <p className="text-[#dc2626]">Processing failed</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comments sidebar — desktop */}
        {isDiscussionVisible && (
          <aside className="hidden lg:flex w-80 xl:w-96 border-l-2 border-[#1a1a1a] flex-col bg-[#f0f0e8] overflow-hidden">
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#1a1a1a]/10 dark:border-white/10 flex items-center justify-between">
              <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[#1a1a1a] dark:text-[#f0f0e8]">
                Discussion
              </h2>
              {comments && comments.length > 0 && (
                <span className="text-[11px] font-medium text-[#888] bg-[#1a1a1a]/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                  {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <CommentList
                videoId={resolvedVideoId}
                comments={commentsThreaded}
                currentUserClerkId={context?.userSubject}
                onTimestampClick={handleTimestampClick}
                onEditingChange={handleEditingChange}
                externalEditTimestamp={editingMarker?.timestampSeconds ?? null}
                externalEditRange={editingCommentId ? rangeMarker : null}
                highlightedCommentId={highlightedCommentId}
                canResolve={canEdit}
                onVisibleIdsChange={setVisibleCommentIds}
                currentUserIdentifier={context?.userSubject}
                currentUserName={video?.uploaderName}
                onSubmitComment={handleSubmitComment}
              />
            </div>
            {canComment && (
              <div className="flex-shrink-0 border-t-2 border-[#1a1a1a] bg-[#f0f0e8]">
                <CommentInput
                  videoId={resolvedVideoId}
                  timestampSeconds={currentTime}
                  showTimestamp
                  variant="seamless"
                  hotkeyTarget
                  onSubmitComment={handleSubmitComment}
                  onRangeChange={editingCommentId ? undefined : setRangeMarker}
                  externalRange={editingCommentId ? null : rangeMarker}
                  onDrawingRequest={() => setDrawingMode(true)}
                  onClearDrawing={() => setDrawingData(null)}
                  drawingData={drawingData}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Comments overlay — mobile */}
      {isDiscussionVisible && mobileCommentsOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col bg-[#f0f0e8]">
          <div className="flex-shrink-0 px-5 py-4 border-b-2 border-[#1a1a1a] flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[#1a1a1a]">
              Discussion
              {comments && comments.length > 0 && (
                <span className="text-[11px] font-medium text-[#888] bg-[#1a1a1a]/5 px-2 py-0.5 rounded-full">
                  {comments.length}
                </span>
              )}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileCommentsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CommentList
              videoId={resolvedVideoId}
              comments={commentsThreaded}
              currentUserClerkId={context?.userSubject}
              onTimestampClick={(time) => {
                handleTimestampClick(time);
                setMobileCommentsOpen(false);
              }}
              onEditingChange={handleEditingChange}
              externalEditTimestamp={editingMarker?.timestampSeconds ?? null}
              externalEditRange={editingCommentId ? rangeMarker : null}
              highlightedCommentId={highlightedCommentId}
              canResolve={canEdit}
              onVisibleIdsChange={setVisibleCommentIds}
              currentUserIdentifier={context?.userSubject}
              currentUserName={video?.uploaderName}
              onSubmitComment={handleSubmitComment}
            />
          </div>
          {canComment && (
            <div className="flex-shrink-0 border-t-2 border-[#1a1a1a] bg-[#f0f0e8]">
              <CommentInput
                videoId={resolvedVideoId}
                timestampSeconds={currentTime}
                showTimestamp
                variant="seamless"
                hotkeyTarget
                onSubmitComment={handleSubmitComment}
                onRangeChange={editingCommentId ? undefined : setRangeMarker}
                externalRange={editingCommentId ? null : rangeMarker}
                onDrawingRequest={() => setDrawingMode(true)}
                onClearDrawing={() => setDrawingData(null)}
                drawingData={drawingData}
              />
            </div>
          )}
        </div>
      )}

      <ShareDialog
        videoId={resolvedVideoId}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}
