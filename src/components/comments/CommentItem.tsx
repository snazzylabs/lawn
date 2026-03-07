"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp, formatTimestampInput, parseTimestampInput, formatRelativeTime, getInitials, cn } from "@/lib/utils";
import { Check, MoreVertical, Trash2, Reply, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useEffect } from "react";
import { CommentInput } from "./CommentInput";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { CommentAttachments } from "./CommentAttachments";
import { CommentDrawingThumbnail } from "./CommentDrawingThumbnail";

interface Comment {
  _id: Id<"comments">;
  videoId: Id<"videos">;
  text: string;
  timestampSeconds: number;
  endTimestampSeconds?: number;
  drawingData?: string;
  parentId?: Id<"comments">;
  resolved: boolean;
  userName: string;
  userCompany?: string;
  userAvatarUrl?: string;
  _creationTime: number;
  userClerkId?: string;
  attachments?: Array<{
    _id?: string;
    filename: string;
    fileSize: number;
    contentType?: string;
    s3Key?: string;
    url?: string;
  }>;
}

interface CommentItemProps {
  comment: Comment;
  currentUserClerkId?: string;
  onTimestampClick: (seconds: number) => void;
  onEditTimestamp?: (commentId: Id<"comments">, timestampSeconds: number) => void;
  onEditingChange?: (editing: { commentId: Id<"comments">; timestamp: number; endTimestamp?: number } | null) => void;
  externalEditTimestamp?: number | null;
  externalEditRange?: { inTime: number; outTime: number } | null;
  isHighlighted?: boolean;
  isReply?: boolean;
  canResolve?: boolean;
  reactions?: Array<{
    emoji: string;
    count: number;
    userIdentifiers: string[];
    userNames?: string[];
  }>;
  inheritedResolved?: boolean;
  currentUserIdentifier?: string;
  currentUserName?: string;
  onSubmitComment?: (args: {
    text: string;
    timestampSeconds: number;
    endTimestampSeconds?: number;
    drawingData?: string;
    parentId?: Id<"comments">;
    files?: File[];
  }) => Promise<void>;
  isActive?: boolean;
  onSelect?: (commentId: Id<"comments">) => void;
}

export function CommentItem({
  comment,
  currentUserClerkId,
  onTimestampClick,
  onEditTimestamp,
  onEditingChange,
  externalEditTimestamp,
  externalEditRange,
  isHighlighted = false,
  isReply = false,
  canResolve = false,
  reactions,
  inheritedResolved = false,
  currentUserIdentifier,
  currentUserName,
  onSubmitComment,
  isActive = false,
  onSelect,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [editTimestamp, setEditTimestamp] = useState(formatTimestampInput(comment.timestampSeconds));
  const [editEndTimestamp, setEditEndTimestamp] = useState(
    comment.endTimestampSeconds !== undefined ? formatTimestampInput(comment.endTimestampSeconds) : "",
  );
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const toggleResolved = useMutation(api.comments.toggleResolved);
  const deleteComment = useMutation(api.comments.remove);
  const updateComment = useMutation(api.comments.update);

  const isOwnComment = currentUserClerkId && comment.userClerkId === currentUserClerkId;
  const isRange = comment.endTimestampSeconds !== undefined;
  const isResolved = comment.resolved || inheritedResolved;

  useEffect(() => {
    if (isEditing && editTextRef.current) {
      editTextRef.current.focus();
      editTextRef.current.selectionStart = editTextRef.current.value.length;
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    if (isRange && externalEditRange) {
      setEditTimestamp(formatTimestampInput(externalEditRange.inTime));
      setEditEndTimestamp(formatTimestampInput(externalEditRange.outTime));
    } else if (!isRange && externalEditTimestamp != null) {
      setEditTimestamp(formatTimestampInput(externalEditTimestamp));
    }
  }, [isEditing, isRange, externalEditRange, externalEditTimestamp]);

  const handleStartEdit = () => {
    setEditText(comment.text);
    setEditTimestamp(formatTimestampInput(comment.timestampSeconds));
    setEditEndTimestamp(
      comment.endTimestampSeconds !== undefined ? formatTimestampInput(comment.endTimestampSeconds) : "",
    );
    setIsEditing(true);
    onEditingChange?.({
      commentId: comment._id,
      timestamp: comment.timestampSeconds,
      ...(comment.endTimestampSeconds !== undefined ? { endTimestamp: comment.endTimestampSeconds } : {}),
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(comment.text);
    setEditTimestamp(formatTimestampInput(comment.timestampSeconds));
    setEditEndTimestamp(
      comment.endTimestampSeconds !== undefined ? formatTimestampInput(comment.endTimestampSeconds) : "",
    );
    onEditingChange?.(null);
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    const parsedTs = parseTimestampInput(editTimestamp);
    const parsedEnd = editEndTimestamp.trim() ? parseTimestampInput(editEndTimestamp) : null;
    try {
      await updateComment({
        commentId: comment._id,
        ...(trimmed !== comment.text ? { text: trimmed } : {}),
        ...(parsedTs !== null && parsedTs !== comment.timestampSeconds ? { timestampSeconds: parsedTs } : {}),
        ...(parsedEnd !== null && parsedEnd !== comment.endTimestampSeconds ? { endTimestampSeconds: parsedEnd } : {}),
      });
      if (parsedTs !== null && parsedTs !== comment.timestampSeconds) {
        onEditTimestamp?.(comment._id, parsedTs);
      }
      setIsEditing(false);
      onEditingChange?.(null);
    } catch (error) {
      console.error("Failed to update comment:", error);
    }
  };

  const handleToggleResolved = async () => {
    try {
      await toggleResolved({ commentId: comment._id });
    } catch (error) {
      console.error("Failed to toggle resolved:", error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      await deleteComment({ commentId: comment._id });
    } catch (error) {
      console.error("Failed to delete comment:", error);
    }
  };

  return (
    <div
      data-comment-id={comment._id}
      className={cn(
        "transition-all relative group",
        isReply ? "py-2" : "p-4",
        isHighlighted
          ? "bg-[#2F6DB4]/10"
          : "hover:bg-[#1a1a1a]/5",
        isResolved && "opacity-50",
        isActive && "bg-[#2F6DB4]/15 outline outline-1 outline-[#2F6DB4]"
      )}
      onClick={() => onSelect?.(comment._id)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shadow-sm">
          <AvatarImage src={comment.userAvatarUrl} />
          <AvatarFallback className="text-[10px]">
            {getInitials(comment.userName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="block truncate font-bold text-sm text-[#1a1a1a]">
                {comment.userName}
              </span>
              {comment.userCompany && (
                <span className="mt-0.5 block truncate text-xs font-normal italic text-[#888]">
                  {comment.userCompany}
                </span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 flex-shrink-0">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwnComment && (
                  <DropdownMenuItem onClick={handleStartEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canResolve && !isReply && (
                  <DropdownMenuItem onClick={handleToggleResolved}>
                    <Check className="mr-2 h-4 w-4" />
                    {isResolved ? "Unresolve" : "Resolve"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-[#dc2626] focus:text-[#dc2626]"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onTimestampClick(comment.timestampSeconds)}
              className="text-xs text-[#2F6DB4] hover:text-[#1a1a1a] font-mono font-bold"
            >
              {formatTimestamp(comment.timestampSeconds)}
              {comment.endTimestampSeconds !== undefined && `–${formatTimestamp(comment.endTimestampSeconds)}`}
            </button>
            {comment.drawingData && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[#2F6DB4]" title="Has annotation">
                <Pencil className="h-3 w-3" />
              </span>
            )}
            {isResolved && (
              <Badge variant="success" className="text-[10px] shrink-0">
                Resolved
              </Badge>
            )}
          </div>
          {isEditing ? (
            <div className="mt-1 space-y-2">
              <textarea
                ref={editTextRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSaveEdit(); }
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="w-full resize-none border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1.5 text-sm text-[#1a1a1a] focus:outline-none"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#888] font-mono">{isRange ? "In" : "@"}</label>
                <input
                  type="text"
                  value={editTimestamp}
                  onChange={(e) => setEditTimestamp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void handleSaveEdit(); }
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  className="w-20 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-1.5 py-0.5 text-xs font-mono text-[#1a1a1a] focus:outline-none"
                  placeholder="mm:ss.ff"
                />
                {isRange && (
                  <>
                    <label className="text-[11px] text-[#888] font-mono">Out</label>
                    <input
                      type="text"
                      value={editEndTimestamp}
                      onChange={(e) => setEditEndTimestamp(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void handleSaveEdit(); }
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                      className="w-20 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-1.5 py-0.5 text-xs font-mono text-[#1a1a1a] focus:outline-none"
                      placeholder="mm:ss.ff"
                    />
                  </>
                )}
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-6 px-2 text-xs bg-[#2F6DB4] text-white hover:bg-[#4DA7F8]" onClick={() => void handleSaveEdit()}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#1a1a1a] mt-1 whitespace-pre-wrap break-words">
                {comment.text}
              </p>
              {comment.drawingData && (
                <CommentDrawingThumbnail
                  src={comment.drawingData}
                  className="w-fit"
                  imageClassName="max-h-28"
                />
              )}
              <CommentAttachments attachments={comment.attachments} />
              <div className="mt-1 flex items-center gap-3">
                <p className="text-[11px] text-[#888]">
                  {formatRelativeTime(comment._creationTime)}
                </p>
                {!isReply && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2F6DB4] hover:text-[#1a1a1a]"
                    onClick={() => setIsReplying((prev) => !prev)}
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>
                )}
              </div>
              {currentUserIdentifier && currentUserName && (
                <div className="mt-1.5">
                  <EmojiReactionPicker
                    commentId={comment._id}
                    reactions={reactions}
                    currentUserIdentifier={currentUserIdentifier}
                    currentUserName={currentUserName}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isReplying && (
        <div className="mt-3 ml-10">
          <CommentInput
            videoId={comment.videoId}
            timestampSeconds={comment.timestampSeconds}
            parentId={comment._id}
            onSubmit={() => setIsReplying(false)}
            onCancel={() => setIsReplying(false)}
            autoFocus
            placeholder="Write a reply..."
            onSubmitComment={onSubmitComment}
          />
        </div>
      )}
    </div>
  );
}
