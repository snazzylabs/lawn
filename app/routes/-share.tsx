import { useAction, useMutation, useQuery } from "convex/react";
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
import { formatDuration, formatTimestamp, formatRelativeTime, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { Lock, Video, AlertCircle, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { HelpButton } from "@/components/HelpDialog";
import { EmojiReactionPicker } from "@/components/comments/EmojiReactionPicker";
import { CommentAttachments } from "@/components/comments/CommentAttachments";
import { CommentDrawingThumbnail } from "@/components/comments/CommentDrawingThumbnail";
import { VideoWorkflowStatusControl } from "@/components/videos/VideoWorkflowStatusControl";
import { compositeDrawingOnFrame, optimizeCommentDrawingData } from "@/lib/compositeDrawing";
import { resolveAttachmentContentType } from "@/lib/attachments";
import { OPEN_HELP_EVENT, focusVisibleCommentInputSoon, isTextEntryTarget } from "@/lib/commentHotkeys";
import { useShareData } from "./-share.data";

export default function SharePage() {
  const params = useParams({ strict: false });
  const token = params.token as string;
  const { isLoaded: isUserLoaded, id: userId, name: signedInUserName } = useCurrentUser();

  const { guest, setGuestIdentity, isReady: isGuestReady } = useGuestIdentity();
  const canComment = Boolean(userId || guest);
  const issueAccessGrant = useMutation(api.shareLinks.issueAccessGrant);
  const createComment = useMutation(api.comments.createForShareGrant);
  const updateGuestComment = useMutation(api.comments.updateForGuest);
  const removeGuestComment = useMutation(api.comments.removeForGuest);
  const approveFinalCut = useMutation(api.videos.approveFinalCutForShareGrant);
  const getPlaybackSession = useAction(api.videoActions.getSharedPlaybackSession);

  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [hasAttemptedAutoGrant, setHasAttemptedAutoGrant] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isRequestingGrant, setIsRequestingGrant] = useState(false);
  const [playbackSession, setPlaybackSession] = useState<{
    url: string;
    posterUrl: string;
    spriteVttUrl?: string;
  } | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
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
  const submitReview = useMutation(api.reviewSubmissions.submit);

  const { shareInfo, videoData, comments } = useShareData({
    token,
    grantToken,
    guestSessionId: guest?.guestId,
  });
  const canTrackPresence = Boolean(playbackSession?.url && videoData?.video?._id);
  const { watchers } = useVideoPresence({
    videoId: videoData?.video?._id,
    enabled: canTrackPresence,
    shareToken: token,
  });

  // Auto-open onboarding for first-time guests once grant is set
  useEffect(() => {
    if (isGuestReady && isUserLoaded && !userId && !guest && grantToken) {
      setShowOnboarding(true);
    }
  }, [isGuestReady, isUserLoaded, userId, guest, grantToken]);

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
    setGrantToken(null);
    setHasAttemptedAutoGrant(false);
  }, [token]);

  const acquireGrant = useCallback(
    async (password?: string) => {
      if (isRequestingGrant) return;
      setIsRequestingGrant(true);
      setPasswordError(false);

      try {
        const result = await issueAccessGrant({ token, password });
        if (result.ok && result.grantToken) {
          setGrantToken(result.grantToken);
          return true;
        }

        setPasswordError(Boolean(password));
        return false;
      } catch {
        setPasswordError(Boolean(password));
        return false;
      } finally {
        setIsRequestingGrant(false);
      }
    },
    [isRequestingGrant, issueAccessGrant, token],
  );

  useEffect(() => {
    if (!shareInfo || grantToken) return;
    if (shareInfo.status !== "ok" || hasAttemptedAutoGrant) return;

    setHasAttemptedAutoGrant(true);
    void acquireGrant();
  }, [acquireGrant, grantToken, hasAttemptedAutoGrant, shareInfo]);

  useEffect(() => {
    if (!grantToken) {
      setPlaybackSession(null);
      setPlaybackError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPlayback(true);
    setPlaybackError(null);

    void getPlaybackSession({ grantToken })
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
  }, [getPlaybackSession, grantToken]);

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
  const createAttachmentMut = useMutation(api.comments.createAttachment);
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
      if (!grantToken) return;
      const preparedDrawing = await prepareDrawingForComment(args.drawingData ?? null);
      const commentId = await createComment({
        grantToken,
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
            await createAttachmentMut({
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
    [createComment, grantToken, guest, getAttachmentUploadUrl, createAttachmentMut, prepareDrawingForComment],
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
    if (!grantToken || isApprovingFinalCut) return;
    if (!canComment) {
      setShowOnboarding(true);
      return;
    }
    setIsApprovingFinalCut(true);
    try {
      await approveFinalCut({
        grantToken,
        approvedByName: guest?.name ?? "Client",
        approvedByCompany: guest?.company,
      });
    } catch (error) {
      console.error("Failed to approve final cut:", error);
    } finally {
      setIsApprovingFinalCut(false);
    }
  }, [approveFinalCut, canComment, grantToken, guest?.company, guest?.name, isApprovingFinalCut]);

  const reactions = useQuery(
    api.comments.getReactionsForVideo,
    videoData?.video?._id
      ? { videoId: videoData.video._id as Id<"videos"> }
      : "skip",
  );

  const isBootstrappingShare =
    shareInfo === undefined ||
    (shareInfo?.status === "ok" &&
      ((!grantToken && (!hasAttemptedAutoGrant || isRequestingGrant)) ||
        (Boolean(grantToken) && videoData === undefined)));

  if (isBootstrappingShare) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <div className="text-[#888]">Opening shared video...</div>
      </div>
    );
  }

  if (shareInfo.status === "missing" || shareInfo.status === "expired") {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <AlertCircle className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Link expired or invalid</CardTitle>
            <CardDescription>
              This share link is no longer valid. Please ask the video owner for a new link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">
                Go to Snazzy Labs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (shareInfo.status === "requiresPassword" && !grantToken) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-4 border-2 border-[#1a1a1a]">
              <Lock className="h-6 w-6 text-[#888]" />
            </div>
            <CardTitle>Password required</CardTitle>
            <CardDescription>
              This video is password protected. Enter the password to view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await acquireGrant(passwordInput);
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-[#dc2626]">Incorrect password</p>
              )}
              <Button type="submit" className="w-full" disabled={!passwordInput || isRequestingGrant}>
                {isRequestingGrant ? "Verifying..." : "View video"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!videoData?.video) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-4 border-2 border-[#1a1a1a]">
              <Video className="h-6 w-6 text-[#888]" />
            </div>
            <CardTitle>Video not available</CardTitle>
            <CardDescription>
              This video is not available or is still processing.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const video = videoData.video;
  const userIdentifier = userId ?? guest?.guestId ?? "";
  const userName = userId ? (signedInUserName ?? "Team Member") : (guest?.name ?? "");

  const renderComment = (
    comment: {
      _id: string;
      userName: string;
      userAvatarUrl?: string;
      userCompany?: string;
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
      resolved?: boolean;
      replies: Array<{
        _id: string;
        userName: string;
        userAvatarUrl?: string;
        userCompany?: string;
        text: string;
        timestampSeconds: number;
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
  ) => (
    <article key={comment._id} className={`border-2 border-[#1a1a1a] bg-[#f0f0e8] p-3${comment.resolved ? " opacity-50" : ""}`}>
      <div className="flex items-start gap-2.5">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={comment.userAvatarUrl} />
          <AvatarFallback className="text-[9px]">{getInitials(comment.userName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-[#1a1a1a] flex items-center gap-1.5">{comment.userName}{comment.userCompany && <span className="text-xs font-normal italic text-[#888] ml-1">· {comment.userCompany}</span>}{comment.resolved && <span className="text-[10px] font-bold uppercase tracking-wider text-[#888] ml-1">Resolved</span>}</div>
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
                onClick={() => playerRef.current?.seekTo(comment.timestampSeconds, { play: true })}
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
              <button
                type="button"
                className="text-[11px] font-bold text-[#888] hover:text-[#2F6DB4]"
                onClick={() => setReplyingToCommentId(replyingToCommentId === comment._id ? null : comment._id)}
              >
                Reply
              </button>
            )}
          </div>
          {userIdentifier && userName && (
            <div className="mt-1.5">
              <EmojiReactionPicker
                commentId={comment._id as Id<"comments">}
                reactions={reactions?.[comment._id]}
                currentUserIdentifier={userIdentifier}
                currentUserName={userName}
              />
            </div>
          )}
        </div>
      </div>

      {comment.replies.length > 0 ? (
        <div className="mt-3 ml-9 border-l-2 border-[#1a1a1a] pl-3 space-y-2">
          {comment.replies.map((reply) => (
            <div key={reply._id} className="text-sm flex items-start gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarImage src={reply.userAvatarUrl} />
                <AvatarFallback className="text-[8px]">{getInitials(reply.userName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#1a1a1a]">{reply.userName}{reply.userCompany && <span className="text-xs font-normal italic text-[#888] ml-1">· {reply.userCompany}</span>}</span>
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
                      onClick={() => playerRef.current?.seekTo(reply.timestampSeconds, { play: true })}
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
        <div className="mt-3 ml-9">
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

  return (
    <div className="min-h-screen bg-[#f0f0e8]">
      <header className="bg-[#f0f0e8] border-b-2 border-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            preload="intent"
            to="/"
            className="text-[#888] hover:text-[#1a1a1a] text-sm flex items-center gap-2 font-bold"
          >
            Snazzy Labs
          </Link>
          <div className="flex items-center gap-3">
            {guest && !userId && (
              <span className="text-[11px] font-medium text-[#888]">
                {guest.name}{guest.company ? ` · ${guest.company}` : ""}
              </span>
            )}
            <HelpButton />
            {canComment && (
              <Button
                size="sm"
                className="h-8"
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
                {reviewSubmitted ? "Review Submitted \u2713" : "Submit Review"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {video.isFinalProof && (
        <div className="border-b-2 border-[#1a1a1a] bg-[#fff3bf] px-6 py-3 dark:border-[#8a6334] dark:bg-[#4b3520]">
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

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#1a1a1a]">{video.title}</h1>
            {video.workflowStatus && (
              <VideoWorkflowStatusControl status={video.workflowStatus} onChange={() => {}} disabled />
            )}
          </div>
          {video.description && (
            <p className="text-[#888] mt-1">{video.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-[#888]">
            {video.duration && <span className="font-mono">{formatDuration(video.duration)}</span>}
            {comments && <span>{comments.length} threads</span>}
            <VideoWatchers watchers={watchers} className="ml-auto" />
          </div>
        </div>

        <div className="border-2 border-[#1a1a1a] overflow-hidden relative">
          {playbackSession?.url ? (
            <>
              <VideoPlayer
                ref={playerRef}
                src={playbackSession.url}
                poster={playbackSession.posterUrl}
                spriteVttUrl={playbackSession.spriteVttUrl}
                comments={flattenedComments}
                onTimeUpdate={setCurrentTime}
                allowDownload={false}
                rangeMarker={rangeMarker ?? undefined}
                pendingInPoint={pendingInPoint ?? undefined}
                pendingCommentPoint={pendingCommentTimestamp ?? undefined}
                maxQualityHeight={!userId ? 720 : undefined}
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
            <div className="relative aspect-video overflow-hidden rounded-xl border border-zinc-800/80 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
              {(playbackSession?.posterUrl || video.thumbnailUrl?.startsWith("http")) ? (
                <img
                  src={playbackSession?.posterUrl ?? video.thumbnailUrl}
                  alt={`${video.title} thumbnail`}
                  className="h-full w-full object-cover blur-[4px]"
                />
              ) : null}
              <div className="absolute inset-0 bg-black/45" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <p className="text-sm font-medium text-white/85">
                  {playbackError ?? (isLoadingPlayback ? "Loading stream..." : "Preparing stream...")}
                </p>
              </div>
            </div>
          )}
        </div>

        <section className="border-2 border-[#1a1a1a] bg-[#e8e8e0] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-[#1a1a1a]">Comments</h2>
            <span className="text-xs text-[#888] font-mono">{formatTimestamp(currentTime)}</span>
          </div>

          <div onClick={!canComment ? handleCommentAreaClick : undefined}>
            {canComment ? (
              <CommentInput
                timestampSeconds={pendingCommentTimestamp ?? currentTime}
                timestampOverrideSeconds={pendingCommentTimestamp}
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
                className="w-full text-left px-3 py-3 text-sm border-2 border-dashed border-[#2F6DB4] bg-[#2F6DB4]/5 text-[#2F6DB4] font-bold transition-colors hover:bg-[#2F6DB4]/10"
              >
                Click to leave feedback...
              </button>
            )}
          </div>

          {comments === undefined ? (
            <p className="text-sm text-[#888]">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#888]">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => renderComment(comment))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t-2 border-[#1a1a1a] px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto text-center text-sm text-[#888]">
          Shared via{" "}
          <Link to="/" preload="intent" className="text-[#1a1a1a] hover:text-[#2F6DB4] font-bold">
            Snazzy Labs
          </Link>
        </div>
      </footer>

      <GuestOnboardingDialog
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}
