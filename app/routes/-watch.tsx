import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Link, useParams } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player/VideoPlayer";
import { DrawingCanvas, type DrawingCanvasHandle, type DrawingTool } from "@/components/video-player/DrawingCanvas";
import { DrawingToolbar } from "@/components/video-player/DrawingToolbar";
import { CommentInput } from "@/components/comments/CommentInput";
import { GuestOnboardingDialog } from "@/components/comments/GuestOnboardingDialog";
import { useGuestIdentity } from "@/lib/useGuestIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn, formatTimestamp, formatRelativeTime, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, MessageSquare, X, Pencil, Trash2, CheckCircle2, FolderOpen, UserRoundPen } from "lucide-react";
import { HelpButton } from "@/components/HelpDialog";
import { CommentAttachments } from "@/components/comments/CommentAttachments";
import { CommentDrawingThumbnail } from "@/components/comments/CommentDrawingThumbnail";
import { VideoWorkflowStatusSteps } from "@/components/videos/VideoWorkflowStatusSteps";
import { compositeDrawingOnFrame, optimizeCommentDrawingData } from "@/lib/compositeDrawing";
import { resolveAttachmentContentType } from "@/lib/attachments";
import { OPEN_HELP_EVENT, focusVisibleCommentInputSoon, isTextEntryTarget } from "@/lib/commentHotkeys";
import { PublicThemeToggleButton } from "@/components/theme/PublicThemeToggleButton";
import { useWatchData } from "./-watch.data";

export default function WatchPage() {
  const params = useParams({ strict: false });
  const publicId = params.publicId as string;
  const { isLoaded: isUserLoaded, id: userId } = useCurrentUser();

  const { guest, setGuestIdentity, isReady: isGuestReady } = useGuestIdentity();
  const canComment = Boolean(userId || guest);
  const createComment = useMutation(api.comments.createForPublic);
  const updateGuestComment = useMutation(api.comments.updateForGuest);
  const removeGuestComment = useMutation(api.comments.removeForGuest);
  const approveFinalCut = useMutation(api.videos.approveFinalCutForPublic);
  const getPlaybackSession = useAction(api.videoActions.getPublicPlaybackSession);

  const { videoData, comments } = useWatchData({
    publicId,
    guestSessionId: guest?.guestId,
  });
  const [playbackSession, setPlaybackSession] = useState<{
    url: string;
    posterUrl: string;
    spriteVttUrl?: string;
  } | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isApprovingFinalCut, setIsApprovingFinalCut] = useState(false);
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  // Drawing state
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingData, setDrawingData] = useState<string | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen");
  const [drawingColor, setDrawingColor] = useState("#ef4444");
  const drawingCanvasRef = useRef<DrawingCanvasHandle>(null);

  // Range state
  const [rangeMarker, setRangeMarker] = useState<{ inTime: number; outTime: number } | null>(null);
  const [pendingInPoint, setPendingInPoint] = useState<number | null>(null);
  const [pendingCommentTimestamp, setPendingCommentTimestamp] = useState<number | null>(null);
  const currentTimeRef = useRef(0);
  const pendingInTimeRef = useRef<number | null>(null);

  // Guest edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [isSubmitReviewFlashing, setIsSubmitReviewFlashing] = useState(false);
  const [isEditingGuestIdentity, setIsEditingGuestIdentity] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState("");
  const [guestCompanyDraft, setGuestCompanyDraft] = useState("");
  const commentsPanelRef = useRef<HTMLDivElement | null>(null);
  const wasNearEndRef = useRef(false);
  const submitReview = useMutation(api.reviewSubmissions.submit);

  // Auto-open onboarding for first-time guests
  useEffect(() => {
    if (isGuestReady && isUserLoaded && !userId && !guest) {
      setShowOnboarding(true);
    }
  }, [isGuestReady, isUserLoaded, userId, guest]);

  useEffect(() => {
    if (!guest) return;
    setGuestNameDraft(guest.name);
    setGuestCompanyDraft(guest.company ?? "");
  }, [guest?.guestId, guest?.name, guest?.company]);

  useEffect(() => {
    if (reviewSubmitted || !videoData?.video?.duration) return;
    const nearEnd = currentTime >= Math.max(videoData.video.duration - 0.35, 0);
    if (nearEnd && !wasNearEndRef.current) {
      setIsSubmitReviewFlashing(true);
      window.setTimeout(() => {
        setIsSubmitReviewFlashing(false);
      }, 2800);
    }
    wasNearEndRef.current = nearEnd;
  }, [currentTime, reviewSubmitted, videoData?.video?.duration]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        e.stopPropagation();
        if (!canComment) {
          setShowOnboarding(true);
          return;
        }
        setPendingCommentTimestamp(currentTimeRef.current);
        if (window.matchMedia("(max-width: 767px)").matches) {
          setMobileCommentsOpen(true);
        }
        focusVisibleCommentInputSoon();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event(OPEN_HELP_EVENT));
        return;
      }

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        e.stopPropagation();
        if (!canComment) {
          setShowOnboarding(true);
          return;
        }
        playerRef.current?.pause();
        setDrawingMode(true);
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        e.stopPropagation();
        playerRef.current?.adjustPlaybackRate(-0.25);
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        e.stopPropagation();
        playerRef.current?.adjustPlaybackRate(0.25);
        return;
      }

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        e.stopPropagation();
        playerRef.current?.setPlaybackRate(1);
        return;
      }

      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        e.stopPropagation();
        const time = currentTimeRef.current;
        pendingInTimeRef.current = time;
        setPendingInPoint(time);
        setRangeMarker(null);
        setPendingCommentTimestamp(null);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        e.stopPropagation();
        const outTime = currentTimeRef.current;
        const pendingIn = pendingInTimeRef.current;
        const start = pendingIn ?? Math.max(0, outTime - 5);
        setRangeMarker({
          inTime: Math.min(start, outTime),
          outTime: Math.max(start, outTime),
        });
        setPendingInPoint(null);
        pendingInTimeRef.current = null;
        setPendingCommentTimestamp(null);
        focusVisibleCommentInputSoon();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canComment]);

  useEffect(() => {
    if (!videoData?.video?.muxPlaybackId && !videoData?.video?.hlsKey) {
      setPlaybackSession(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPlayback(true);
    setPlaybackError(null);

    void getPlaybackSession({ publicId })
      .then((session) => {
        if (cancelled) return;
        setPlaybackSession(session);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackError("Unable to load playback session.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getPlaybackSession, publicId, videoData?.video?.muxPlaybackId]);

  const flattenedComments = useMemo(() => {
    if (!comments) return [] as Array<{ _id: string; timestampSeconds: number; endTimestampSeconds?: number; resolved: boolean }>;

    const markers: Array<{ _id: string; timestampSeconds: number; endTimestampSeconds?: number; resolved: boolean }> = [];
    for (const comment of comments) {
      markers.push({
        _id: comment._id,
        timestampSeconds: comment.timestampSeconds,
        endTimestampSeconds: comment.endTimestampSeconds,
        resolved: comment.resolved,
      });
      for (const reply of comment.replies) {
        markers.push({
          _id: reply._id,
          timestampSeconds: reply.timestampSeconds,
          resolved: reply.resolved,
        });
      }
    }
    return markers;
  }, [comments]);

  const handleCommentAreaClick = useCallback(() => {
    if (!userId && !guest) {
      setShowOnboarding(true);
    }
  }, [userId, guest]);

  const handleOnboardingComplete = useCallback(
    (name: string, company?: string) => {
      setGuestIdentity(name, company);
      setShowOnboarding(false);
    },
    [setGuestIdentity],
  );

  const getAttachmentUploadUrl = useAction(api.videoActions.getAttachmentUploadUrl);
  const createAttachment = useMutation(api.comments.createAttachment);
  const prepareDrawingForComment = useCallback(
    async (draft?: string | null) => {
      if (draft) {
        return await optimizeCommentDrawingData(draft);
      }
      const canvas = drawingCanvasRef.current;
      if (!canvas || canvas.getStrokes().length === 0) return drawingData;

      const rawDrawing = canvas.toDataURL();
      if (!rawDrawing) return null;

      const frame = playerRef.current
        ? await playerRef.current.captureFrameWithFallback()
        : null;
      if (!frame) {
        return await optimizeCommentDrawingData(rawDrawing);
      }

      try {
        return await compositeDrawingOnFrame(frame, rawDrawing);
      } catch {
        return await optimizeCommentDrawingData(rawDrawing);
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
      const preparedDrawing = await prepareDrawingForComment(args.drawingData ?? null);
      const commentId = await createComment({
        publicId,
        text: args.text,
        timestampSeconds: args.timestampSeconds,
        endTimestampSeconds: args.endTimestampSeconds,
        drawingData: preparedDrawing ?? undefined,
        parentId: args.parentId,
        userName: guest?.name,
        guestSessionId: guest?.guestId,
        userCompany: guest?.company,
      });
      if (args.files?.length && commentId) {
        for (const file of args.files) {
          try {
            const contentType = resolveAttachmentContentType(file);
            const { url, s3Key } = await getAttachmentUploadUrl({
              commentId,
              filename: file.name,
              fileSize: file.size,
              contentType,
              guestSessionId: guest?.guestId,
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
              guestSessionId: guest?.guestId,
            });
          } catch (e) {
            console.error("Failed to upload attachment:", e);
          }
        }
      }
      setDrawingData(null);
      setDrawingMode(false);
      setRangeMarker(null);
      setPendingInPoint(null);
      setPendingCommentTimestamp(null);
      pendingInTimeRef.current = null;
    },
    [createComment, publicId, guest, getAttachmentUploadUrl, createAttachment, prepareDrawingForComment],
  );

  const handleEditSave = useCallback(
    async (commentId: string) => {
      if (!editingText.trim() || !guest?.guestId) return;
      await updateGuestComment({
        commentId: commentId as Id<"comments">,
        guestSessionId: guest.guestId,
        text: editingText.trim(),
      });
      setEditingCommentId(null);
      setEditingText("");
    },
    [editingText, guest, updateGuestComment],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!guest?.guestId) return;
      await removeGuestComment({
        commentId: commentId as Id<"comments">,
        guestSessionId: guest.guestId,
      });
    },
    [guest, removeGuestComment],
  );

  const handleApproveFinalCut = useCallback(async () => {
    if (!publicId || isApprovingFinalCut) return;
    if (!canComment) {
      setShowOnboarding(true);
      return;
    }
    setIsApprovingFinalCut(true);
    try {
      await approveFinalCut({
        publicId,
        approvedByName: guest?.name ?? "Client",
        approvedByCompany: guest?.company,
      });
    } catch (error) {
      console.error("Failed to approve final cut:", error);
    } finally {
      setIsApprovingFinalCut(false);
    }
  }, [approveFinalCut, canComment, guest?.company, guest?.name, isApprovingFinalCut, publicId]);

  const scrollToComment = useCallback((commentId: string) => {
    const selector = `[data-comment-id="${commentId}"]`;
    const target = commentsPanelRef.current?.querySelector(selector)
      ?? document.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedCommentId(commentId);
    window.setTimeout(() => {
      setHighlightedCommentId((prev) => (prev === commentId ? null : prev));
    }, 2400);
  }, []);

  const handleMarkerClick = useCallback((commentId: string) => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileCommentsOpen(true);
      window.setTimeout(() => {
        scrollToComment(commentId);
      }, 120);
      return;
    }
    scrollToComment(commentId);
  }, [scrollToComment]);

  const handleSaveGuestIdentity = useCallback(() => {
    if (!guest || userId) return;
    const nextName = guestNameDraft.trim();
    const nextCompany = guestCompanyDraft.trim();
    if (!nextName) return;
    setGuestIdentity(nextName, nextCompany || undefined);
    setIsEditingGuestIdentity(false);
  }, [guest, guestCompanyDraft, guestNameDraft, setGuestIdentity, userId]);

  if (videoData === undefined) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <div className="text-[#888]">Loading...</div>
      </div>
    );
  }

  if (!videoData?.video) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <AlertCircle className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Video unavailable</CardTitle>
            <CardDescription>
              This video is private, invalid, or no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">Go to Snazzy Labs</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const video = videoData.video;

  const renderComment = (
    comment: {
      _id: string;
      userName: string;
      userAvatarUrl?: string;
      text: string;
      timestampSeconds: number;
      endTimestampSeconds?: number;
      drawingData?: string;
      attachments?: Array<{
        _id?: string;
        filename: string;
        fileSize: number;
        contentType?: string;
        s3Key?: string;
        url?: string;
      }>;
      _creationTime: number;
      isGuestOwned?: boolean;
      userCompany?: string;
      resolved?: boolean;
      replies: Array<{
        _id: string;
        userName: string;
        userAvatarUrl?: string;
        userCompany?: string;
        text: string;
        timestampSeconds: number;
        resolved?: boolean;
        attachments?: Array<{
          _id?: string;
          filename: string;
          fileSize: number;
          contentType?: string;
          s3Key?: string;
          url?: string;
        }>;
        _creationTime: number;
        isGuestOwned?: boolean;
      }>;
    },
    opts?: { onSeek?: (time: number) => void },
  ) => {
    const seekTo = (time: number) => {
      playerRef.current?.seekTo(time, { play: true });
      opts?.onSeek?.(time);
    };

    return (
      <article
        key={comment._id}
        data-comment-id={comment._id}
        className={cn(
          "relative p-4 transition-colors hover:bg-[#1a1a1a]/5",
          comment.resolved && "opacity-50",
          highlightedCommentId === comment._id && "bg-[color:var(--accent)]/12 opacity-100",
        )}
      >
        <div className="flex items-start gap-2.5">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={comment.userAvatarUrl} />
            <AvatarFallback className="text-[9px]">{getInitials(comment.userName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1a1a1a] truncate">
                  {comment.userName}
                </p>
                {comment.userCompany && (
                  <p className="text-[11px] font-normal italic text-[#888] truncate">
                    {comment.userCompany}
                  </p>
                )}
                {comment.resolved && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888] ml-1">Resolved</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {comment.isGuestOwned && editingCommentId !== comment._id && (
                  <>
                    <button
                      type="button"
                      className="text-[#888] hover:text-[#1a1a1a]"
                      onClick={() => {
                        setEditingCommentId(comment._id);
                        setEditingText(comment.text);
                      }}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="text-[#888] hover:text-[#dc2626]"
                      onClick={() => void handleDelete(comment._id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="font-mono text-xs text-[#2F6DB4] hover:text-[#1a1a1a]"
                  onClick={() => seekTo(comment.timestampSeconds)}
                >
                  {formatTimestamp(comment.timestampSeconds)}
                  {comment.endTimestampSeconds != null && (
                    <> – {formatTimestamp(comment.endTimestampSeconds)}</>
                  )}
                </button>
              </div>
            </div>
            {editingCommentId === comment._id ? (
              <div className="mt-1 space-y-1">
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1 text-sm focus:outline-none"
                  rows={2}
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    className="h-7 px-3 text-xs"
                    onClick={() => void handleEditSave(comment._id)}
                    disabled={!editingText.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs"
                    onClick={() => setEditingCommentId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#1a1a1a] mt-1 whitespace-pre-wrap">{comment.text}</p>
            )}
            <CommentAttachments attachments={comment.attachments} />
            {comment.drawingData && (
              <CommentDrawingThumbnail
                src={comment.drawingData}
                className="w-fit"
                imageClassName="max-h-32"
              />
            )}
            <div className="flex items-center gap-3 mt-1">
              <p className="text-[11px] text-[#888]">{formatRelativeTime(comment._creationTime)}</p>
              {canComment && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] tracking-[0.08em]"
                  onClick={() => setReplyingToCommentId(replyingToCommentId === comment._id ? null : comment._id)}
                >
                  Reply
                </Button>
              )}
            </div>
          </div>
        </div>

        {comment.replies.length > 0 ? (
          <div className="mt-3 ml-6 mr-2 border-l border-[#1a1a1a]/20 pl-3 sm:ml-9 sm:mr-0 space-y-2">
            {comment.replies.map((reply) => (
              <div
                key={reply._id}
                data-comment-id={reply._id}
                className={cn(
                  "text-sm flex items-start gap-2 rounded px-1 py-0.5",
                  (comment.resolved || reply.resolved) && "opacity-50",
                  highlightedCommentId === reply._id && "bg-[color:var(--accent)]/12 opacity-100",
                )}
              >
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={reply.userAvatarUrl} />
                  <AvatarFallback className="text-[8px]">{getInitials(reply.userName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-[#1a1a1a] truncate">{reply.userName}</p>
                      {reply.userCompany && (
                        <p className="text-[11px] font-normal italic text-[#888] truncate">
                          {reply.userCompany}
                        </p>
                      )}
                      {(comment.resolved || reply.resolved) && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {reply.isGuestOwned && editingCommentId !== reply._id && (
                        <>
                          <button
                            type="button"
                            className="text-[#888] hover:text-[#1a1a1a]"
                            onClick={() => {
                              setEditingCommentId(reply._id);
                              setEditingText(reply.text);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="text-[#888] hover:text-[#dc2626]"
                            onClick={() => void handleDelete(reply._id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="font-mono text-xs text-[#2F6DB4] hover:text-[#1a1a1a]"
                        onClick={() => seekTo(reply.timestampSeconds)}
                      >
                        {formatTimestamp(reply.timestampSeconds)}
                      </button>
                    </div>
                  </div>
                  {editingCommentId === reply._id ? (
                    <div className="mt-1 space-y-1">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1 text-sm focus:outline-none"
                        rows={2}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          className="h-7 px-3 text-xs"
                          onClick={() => void handleEditSave(reply._id)}
                          disabled={!editingText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => setEditingCommentId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[#1a1a1a] whitespace-pre-wrap">{reply.text}</p>
                  )}
                  <CommentAttachments attachments={reply.attachments} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {replyingToCommentId === comment._id && canComment && (
          <div className="mt-3 ml-6 mr-2 sm:ml-9 sm:mr-0">
            <CommentInput
              timestampSeconds={currentTime}
              onSubmitComment={handleSubmitComment}
              videoId={userId ? video._id : undefined}
              parentId={comment._id as Id<"comments">}
              autoFocus
              placeholder="Write a reply..."
              onSubmit={() => setReplyingToCommentId(null)}
              onCancel={() => setReplyingToCommentId(null)}
            />
          </div>
        )}
      </article>
    );
  };

  const commentInputSection = (
    <div onClick={!canComment ? handleCommentAreaClick : undefined}>
      {canComment ? (
        <CommentInput
          timestampSeconds={pendingCommentTimestamp ?? currentTime}
          timestampOverrideSeconds={pendingCommentTimestamp}
          variant="seamless"
          showTimestamp
          hotkeyTarget
          onSubmitComment={handleSubmitComment}
          videoId={userId ? video._id : undefined}
          onRangeChange={setRangeMarker}
          externalRange={rangeMarker}
          onDrawingRequest={() => setDrawingMode(true)}
          onClearDrawing={() => setDrawingData(null)}
          drawingData={drawingData}
        />
      ) : (
        <button
          type="button"
          onClick={handleCommentAreaClick}
          className="w-full border-2 border-[color:var(--button-border)] bg-[color:var(--button-fill)] px-4 py-3 text-left text-sm font-bold text-[color:var(--button-text)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[color:var(--button-fill-hover)] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]"
        >
          Click to leave feedback...
        </button>
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-[#f0f0e8]">
      {/* Header */}
      <header className="flex-shrink-0 bg-[#f0f0e8] border-b-2 border-[#1a1a1a] px-3 md:px-5 py-2.5 md:py-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          {video.projectPublicId ? (
            <a
              href={`/projects/${video.projectPublicId}?vp=${encodeURIComponent(publicId)}`}
              className="inline-flex h-10 items-center gap-1.5 border-2 border-[color:var(--button-border)] bg-[color:var(--button-fill)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--button-text)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[color:var(--button-fill-hover)] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_var(--shadow-accent)]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Project</span>
            </a>
          ) : (
            <Link
              preload="intent"
              to="/"
              className="text-[#888] hover:text-[#1a1a1a] text-sm flex items-center gap-2 font-bold"
            >
              Snazzy Labs
            </Link>
          )}
          <div className="hidden md:block h-4 w-[2px] bg-[#1a1a1a]/20" />
          <h1 className="text-base font-black truncate max-w-[120px] sm:max-w-[220px] lg:max-w-[300px]">{video.title}</h1>
          {video.workflowStatus && (
            <VideoWorkflowStatusSteps status={video.workflowStatus} className="hidden lg:inline-flex" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-[#888]">
          {guest && !userId && (
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-1.5 border-2 border-[color:var(--button-border)] bg-[color:var(--button-fill)] px-2 text-[11px] text-[color:var(--button-text)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[color:var(--button-fill-hover)] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_var(--shadow-accent)]"
                onClick={() => setIsEditingGuestIdentity((prev) => !prev)}
                title="Edit reviewer name"
              >
                <span className="flex max-w-[120px] flex-col items-start leading-tight">
                  <span className="font-bold truncate w-full">{guest.name}</span>
                  {guest.company && (
                    <span className="text-[10px] italic text-[#888] truncate w-full">{guest.company}</span>
                  )}
                </span>
                <UserRoundPen className="h-3 w-3" />
              </button>
              {isEditingGuestIdentity && (
                <div className="absolute right-0 top-full z-40 mt-2 w-64 border-2 border-[color:var(--button-border)] bg-[color:var(--background)] p-2 shadow-[4px_4px_0px_0px_var(--shadow-accent)]">
                  <div className="space-y-2">
                    <Input
                      value={guestNameDraft}
                      onChange={(event) => setGuestNameDraft(event.target.value)}
                      placeholder="Name"
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <Input
                      value={guestCompanyDraft}
                      onChange={(event) => setGuestCompanyDraft(event.target.value)}
                      placeholder="Company (optional)"
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setIsEditingGuestIdentity(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={handleSaveGuestIdentity}
                        disabled={!guestNameDraft.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <PublicThemeToggleButton />
          <HelpButton variant="outline" className="h-10 w-10" />
          {canComment && (
            <Button
              size="sm"
              className={cn(
                "h-10 px-4",
                isSubmitReviewFlashing && !reviewSubmitted && "animate-pulse ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--background)]",
              )}
              disabled={reviewSubmitted}
              onClick={async () => {
                if (!video?._id) return;
                try {
                  await submitReview({
                    videoId: video._id as Id<"videos">,
                    submittedByName: guest?.name ?? "User",
                    submittedByCompany: guest?.company,
                    guestSessionId: guest?.guestId,
                    userClerkId: userId ?? undefined,
                  });
                  setReviewSubmitted(true);
                } catch (e) {
                  console.error("Failed to submit review:", e);
                }
              }}
            >
              {reviewSubmitted ? (
                <>
                  <span className="hidden lg:inline">Review Submitted ✓</span>
                  <span className="lg:hidden">Submitted ✓</span>
                </>
              ) : (
                <>
                  <span className="hidden lg:inline">Submit Review</span>
                  <span className="lg:hidden">Submit</span>
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="md:hidden h-10 px-4"
            onClick={() => setMobileCommentsOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
            {comments && comments.length > 0 && (
              <span className="ml-1.5 text-xs">{comments.length}</span>
            )}
          </Button>
        </div>
      </header>

      {video.isFinalProof && (
        <div className="border-b-2 border-[#1a1a1a] bg-[#fff3bf] px-5 py-3 dark:border-[#8a6334] dark:bg-[#4b3520] sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1a1a1a] dark:text-[#f8e8c7]">
                Final Proof
              </p>
              <p className="text-sm text-[#1a1a1a] dark:text-[#f3e6c7]">
                {video.finalCutApprovedAt
                  ? `Approved by ${video.finalCutApprovedByName ?? "client"} and ready for publishing.`
                  : "We hope you like our changes! Approve to notify team for publishing."}
              </p>
            </div>
            {video.finalCutApprovedAt ? (
              <span className="inline-flex items-center gap-2 border-2 border-[#1a1a1a] bg-[#22c55e] px-3 py-2 text-sm font-black uppercase tracking-wide text-white">
                <CheckCircle2 className="h-4 w-4" />
                Final Cut Approved
              </span>
            ) : (
              <Button
                className="h-11 border-2 border-[#1a1a1a] bg-[#16a34a] px-5 text-sm font-black uppercase tracking-wide text-white shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:bg-[#15803d]"
                onClick={() => void handleApproveFinalCut()}
                disabled={isApprovingFinalCut}
              >
                {isApprovingFinalCut ? "Approving..." : "Approve Final Cut"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main content - horizontal split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-black relative">
          {playbackSession?.url ? (
            <>
              <VideoPlayer
                ref={playerRef}
                src={playbackSession.url}
                poster={playbackSession.posterUrl}
                spriteVttUrl={playbackSession.spriteVttUrl}
                comments={flattenedComments}
                onTimeUpdate={setCurrentTime}
                onMarkerClick={(comment) => handleMarkerClick(comment._id)}
                allowDownload={false}
                controlsBelow
                rangeMarker={rangeMarker ?? undefined}
                pendingInPoint={pendingInPoint ?? undefined}
                pendingCommentPoint={pendingCommentTimestamp ?? undefined}
                defaultQualityHeight={1080}
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
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white">
                 <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                 <p className="text-sm font-medium text-white/85">
                   {playbackError ?? (isLoadingPlayback ? "Loading stream..." : "Preparing stream...")}
                 </p>
              </div>
            </div>
          )}
        </div>

        {/* Comments sidebar — desktop */}
        <aside className="hidden md:flex md:w-[22rem] lg:w-[24rem] xl:w-[26rem] border-l-2 border-[#1a1a1a] flex-col bg-[#f0f0e8]">
          <div className="flex-shrink-0 px-5 py-4 border-b border-[#1a1a1a]/10 flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[#1a1a1a]">
              Discussion
            </h2>
            {comments && comments.length > 0 && (
              <span className="text-[11px] font-medium text-[#888] bg-[#1a1a1a]/5 px-2 py-0.5 rounded-full">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </span>
            )}
          </div>

          <div ref={commentsPanelRef} className="flex-1 overflow-y-auto">
            {comments === undefined ? (
              <p className="p-4 text-sm text-[#888]">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="p-4 text-sm text-[#888]">No comments yet.</p>
            ) : (
              <div className="divide-y divide-[#1a1a1a]/10">
                {comments.map((comment) => renderComment(comment))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t-2 border-[#1a1a1a] bg-[#f0f0e8]">
            {commentInputSection}
          </div>
        </aside>
      </div>

      {/* Comments overlay — mobile */}
      {mobileCommentsOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col bg-[#f0f0e8]">
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

          <div ref={commentsPanelRef} className="flex-1 overflow-y-auto">
            {comments === undefined ? (
              <p className="p-4 text-sm text-[#888]">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="p-4 text-sm text-[#888]">No comments yet.</p>
            ) : (
              <div className="divide-y divide-[#1a1a1a]/10">
                {comments.map((comment) =>
                  renderComment(comment, {
                    onSeek: () => setMobileCommentsOpen(false),
                  }),
                )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t-2 border-[#1a1a1a] bg-[#f0f0e8] pb-safe">
            {commentInputSection}
          </div>
        </div>
      )}

      <GuestOnboardingDialog
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}
