"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { CommentItem } from "./CommentItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTextEntryTarget } from "@/lib/commentHotkeys";

type ThreadedComments = FunctionReturnType<typeof api.comments.getThreaded>;
type ResolvedFilter = "all" | "open" | "resolved";

interface CommentListProps {
  videoId: Id<"videos">;
  comments?: ThreadedComments;
  currentUserClerkId?: string;
  onTimestampClick: (seconds: number) => void;
  onEditTimestamp?: (commentId: Id<"comments">, timestampSeconds: number) => void;
  onEditingChange?: (editing: { commentId: Id<"comments">; timestamp: number; endTimestamp?: number } | null) => void;
  externalEditTimestamp?: number | null;
  externalEditRange?: { inTime: number; outTime: number } | null;
  highlightedCommentId?: Id<"comments">;
  canResolve?: boolean;
  onVisibleIdsChange?: (ids: Set<string>) => void;
  onSubmitComment?: (args: {
    text: string;
    timestampSeconds: number;
    endTimestampSeconds?: number;
    drawingData?: string;
    parentId?: Id<"comments">;
    files?: File[];
  }) => Promise<void>;
}

export function CommentList({
  videoId,
  comments: providedComments,
  currentUserClerkId,
  onTimestampClick,
  onEditTimestamp,
  onEditingChange,
  externalEditTimestamp,
  externalEditRange,
  highlightedCommentId,
  canResolve = false,
  onVisibleIdsChange,
  onSubmitComment,
}: CommentListProps) {
  const queriedComments = useQuery(api.comments.getThreaded, { videoId });
  const comments = providedComments ?? queriedComments;
  const toggleResolved = useMutation(api.comments.toggleResolved);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResolvedFilter>("all");
  const [activeCommentId, setActiveCommentId] = useState<Id<"comments"> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const resolvedCount = useMemo(
    () => comments?.filter((c) => c.resolved).length ?? 0,
    [comments],
  );
  const openCount = useMemo(
    () => comments?.filter((c) => !c.resolved).length ?? 0,
    [comments],
  );

  const filtered = useMemo(() => {
    if (!comments) return undefined;
    const q = search.toLowerCase().trim();
    return comments.filter((c) => {
      if (filter === "open" && c.resolved) return false;
      if (filter === "resolved" && !c.resolved) return false;
      if (!q) return true;
      if (c.text.toLowerCase().includes(q)) return true;
      if (c.userName.toLowerCase().includes(q)) return true;
      if (c.replies.some((r) => r.text.toLowerCase().includes(q) || r.userName.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [comments, search, filter]);

  const prevIdsRef = useRef<string>("");
  useEffect(() => {
    if (!onVisibleIdsChange || !filtered) return;
    const isFiltering = filter !== "all" || search.trim() !== "";
    if (!isFiltering) {
      const key = "__all__";
      if (prevIdsRef.current !== key) {
        prevIdsRef.current = key;
        onVisibleIdsChange(new Set());
      }
      return;
    }
    const ids = new Set(filtered.map((c) => c._id as string));
    const key = [...ids].sort().join(",");
    if (prevIdsRef.current !== key) {
      prevIdsRef.current = key;
      onVisibleIdsChange(ids);
    }
  }, [filtered, filter, search, onVisibleIdsChange]);

  const keyboardItems = useMemo(() => {
    if (!filtered) return [] as Array<{ id: Id<"comments">; canResolve: boolean }>;
    return filtered.flatMap((comment) => [
      { id: comment._id, canResolve: true },
      ...comment.replies.map((reply) => ({ id: reply._id, canResolve: false })),
    ]);
  }, [filtered]);

  useEffect(() => {
    if (keyboardItems.length === 0) {
      setActiveCommentId(null);
      return;
    }
    if (activeCommentId && keyboardItems.some((item) => item.id === activeCommentId)) {
      return;
    }
    setActiveCommentId(keyboardItems[0]?.id ?? null);
  }, [activeCommentId, keyboardItems]);

  useEffect(() => {
    if (!activeCommentId) return;
    const root = rootRef.current;
    if (!root) return;
    const escapedId = typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(activeCommentId)
      : activeCommentId.replace(/"/g, '\\"');
    const el = root.querySelector<HTMLElement>(`[data-comment-id="${escapedId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeCommentId]);

  const moveSelection = useCallback((delta: number) => {
    if (keyboardItems.length === 0) return;
    setActiveCommentId((prev) => {
      const currentIndex = prev ? keyboardItems.findIndex((item) => item.id === prev) : -1;
      if (currentIndex === -1) {
        return keyboardItems[Math.max(0, delta > 0 ? 0 : keyboardItems.length - 1)]?.id ?? null;
      }
      const nextIndex = Math.min(
        Math.max(currentIndex + delta, 0),
        keyboardItems.length - 1,
      );
      return keyboardItems[nextIndex]?.id ?? prev;
    });
  }, [keyboardItems]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const style = window.getComputedStyle(root);
      const isVisible = root.offsetParent !== null || style.position === "fixed";
      if (!isVisible) return;

      if (isTextEntryTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }
      if ((event.key === "r" || event.key === "R") && canResolve && activeCommentId) {
        const activeItem = keyboardItems.find((item) => item.id === activeCommentId);
        if (!activeItem || !activeItem.canResolve) return;
        event.preventDefault();
        void toggleResolved({ commentId: activeCommentId });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeCommentId, canResolve, keyboardItems, moveSelection, toggleResolved]);

  if (comments === undefined) {
    return (
      <div className="p-4 text-center text-[#888]">Loading...</div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-[#888] text-sm text-center">
          No comments yet.<br />
          Click on the timeline to add one.
        </p>
      </div>
    );
  }

  const FILTERS: { key: ResolvedFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: comments.length },
    { key: "open", label: "Open", count: openCount },
    { key: "resolved", label: "Resolved", count: resolvedCount },
  ];

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[#1a1a1a]/10 dark:border-white/10 px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments..."
            className="w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] py-1.5 pl-7 pr-7 text-xs text-[#1a1a1a] placeholder:text-[#888] focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#1a1a1a]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1 border-2 px-2 text-[10px] font-bold uppercase tracking-[0.08em] shadow-[2px_2px_0px_0px_var(--shadow-accent)] transition-all",
                filter === f.key
                  ? "border-[color:var(--button-border)] bg-[color:var(--accent)]/20 text-[color:var(--button-text)]"
                  : "border-[color:var(--button-border)] bg-[color:var(--button-fill)] text-[color:var(--foreground-muted)] hover:text-[color:var(--button-text)]",
              )}
            >
              {f.label}
              <span className="font-mono font-normal">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {filtered && filtered.length === 0 ? (
          <div className="p-6 text-center text-[#888] text-sm">
            {search ? "No matching comments." : "No comments in this view."}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#1a1a1a]/10 dark:divide-white/10">
            {filtered?.map((comment) => (
              <div key={comment._id} className="relative">
                <CommentItem
                  comment={comment}
                  currentUserClerkId={currentUserClerkId}
                  onTimestampClick={onTimestampClick}
                  onEditTimestamp={onEditTimestamp}
                  onEditingChange={onEditingChange}
                  externalEditTimestamp={externalEditTimestamp}
                  externalEditRange={externalEditRange}
                  isHighlighted={highlightedCommentId === comment._id}
                  canResolve={canResolve}
                  onSubmitComment={onSubmitComment}
                  isActive={activeCommentId === comment._id}
                  onSelect={setActiveCommentId}
                />
                {comment.replies.length > 0 && (
                  <div className="pl-14 pr-4 pb-4 space-y-4 relative">
                    <div className="absolute left-[1.35rem] top-0 bottom-6 w-px bg-[#1a1a1a]/10 dark:bg-white/10" />
                    {comment.replies.map((reply) => (
                      <CommentItem
                        key={reply._id}
                        comment={reply}
                        currentUserClerkId={currentUserClerkId}
                        onTimestampClick={onTimestampClick}
                        onEditTimestamp={onEditTimestamp}
                        onEditingChange={onEditingChange}
                        externalEditTimestamp={externalEditTimestamp}
                        externalEditRange={externalEditRange}
                        isHighlighted={highlightedCommentId === reply._id}
                        isReply
                        canResolve={canResolve}
                        inheritedResolved={comment.resolved}
                        onSubmitComment={onSubmitComment}
                        isActive={activeCommentId === reply._id}
                        onSelect={setActiveCommentId}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
