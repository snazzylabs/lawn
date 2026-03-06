"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatBytes, formatTimestamp, formatTimestampInput, parseTimestampInput } from "@/lib/utils";
import { Send, X, Scissors, Pencil, Paperclip } from "lucide-react";

interface CommentInputProps {
  videoId?: Id<"videos">;
  timestampSeconds: number;
  parentId?: Id<"comments">;
  onSubmit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  showTimestamp?: boolean;
  variant?: "default" | "seamless";
  onRangeChange?: (range: { inTime: number; outTime: number } | null) => void;
  externalRange?: { inTime: number; outTime: number } | null;
  onDrawingRequest?: () => void;
  drawingData?: string | null;
  onSubmitComment?: (args: {
    text: string;
    timestampSeconds: number;
    endTimestampSeconds?: number;
    drawingData?: string;
    parentId?: Id<"comments">;
    files?: File[];
  }) => Promise<void>;
}

export function CommentInput({
  videoId,
  timestampSeconds,
  parentId,
  onSubmit,
  onCancel,
  autoFocus = false,
  placeholder,
  showTimestamp = false,
  variant = "default",
  onRangeChange,
  externalRange,
  onDrawingRequest,
  drawingData,
  onSubmitComment,
}: CommentInputProps) {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createComment = useMutation(api.comments.create);

  // Auto-activate range mode when externalRange transitions from null to non-null
  const prevExternalRangeRef = useRef(externalRange);
  useEffect(() => {
    const wasNull = prevExternalRangeRef.current == null;
    prevExternalRangeRef.current = externalRange;
    if (externalRange && wasNull && !rangeMode) {
      setRangeMode(true);
      textareaRef.current?.focus();
    }
  }, [externalRange, rangeMode]);

  useEffect(() => {
    if (externalRange) {
      setInTime(formatTimestampInput(externalRange.inTime));
      setOutTime(formatTimestampInput(externalRange.outTime));
    }
  }, [externalRange]);

  const defaultPlaceholder = showTimestamp 
    ? `Comment at ${formatTimestamp(timestampSeconds)}...` 
    : "Add a comment...";
  const finalPlaceholder = placeholder || defaultPlaceholder;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  const toggleRangeMode = () => {
    const next = !rangeMode;
    setRangeMode(next);
    if (next) {
      const inSec = timestampSeconds;
      const outSec = timestampSeconds + 5;
      setInTime(formatTimestampInput(inSec));
      setOutTime(formatTimestampInput(outSec));
      onRangeChange?.({ inTime: inSec, outTime: outSec });
    } else {
      clearRange();
    }
  };

  const clearRange = () => {
    setRangeMode(false);
    setInTime("");
    setOutTime("");
    onRangeChange?.(null);
  };

  const handleInTimeChange = (val: string) => {
    setInTime(val);
    const parsed = parseTimestampInput(val);
    const parsedOut = parseTimestampInput(outTime);
    if (parsed !== null && parsedOut !== null) {
      onRangeChange?.({ inTime: parsed, outTime: parsedOut });
    }
  };

  const handleOutTimeChange = (val: string) => {
    setOutTime(val);
    const parsedIn = parseTimestampInput(inTime);
    const parsed = parseTimestampInput(val);
    if (parsedIn !== null && parsed !== null) {
      onRangeChange?.({ inTime: parsedIn, outTime: parsed });
    }
  };

  const submitComment = async () => {
    if (!text.trim() && pendingFiles.length === 0) return;

    setIsLoading(true);
    try {
      const parsedIn = rangeMode ? parseTimestampInput(inTime) : null;
      const parsedOut = rangeMode ? parseTimestampInput(outTime) : null;
      const payload = {
        text: text.trim(),
        timestampSeconds: parsedIn ?? timestampSeconds,
        ...(parsedOut !== null ? { endTimestampSeconds: parsedOut } : {}),
        ...(drawingData ? { drawingData } : {}),
        parentId,
        ...(pendingFiles.length > 0 ? { files: pendingFiles } : {}),
      };
      if (onSubmitComment) {
        await onSubmitComment(payload);
      } else {
        await createComment({ videoId: videoId!, ...payload });
      }
      setText("");
      setRangeMode(false);
      setInTime("");
      setOutTime("");
      setPendingFiles([]);
      onRangeChange?.(null);
      onSubmit?.();
    } catch (error) {
      console.error("Failed to create comment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitComment();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      void submitComment();
    }
    if (e.key === "Escape") {
      if (rangeMode) {
        clearRange();
      }
      onCancel?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={
          variant === "seamless"
            ? "w-full bg-[#f0f0e8]"
            : "w-full bg-[#f0f0e8] border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)]"
        }
      >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={finalPlaceholder}
        autoFocus={autoFocus}
        className={
          variant === "seamless"
            ? "block w-full max-h-64 min-h-[100px] bg-transparent border-0 focus:ring-0 resize-none px-4 pt-4 pb-3 text-sm leading-relaxed text-[#1a1a1a] placeholder:text-[#888] font-sans outline-none"
            : "block w-full max-h-64 min-h-[100px] bg-[#f0f0e8] border-0 focus:ring-0 resize-none px-3 pt-3 pb-3 text-sm leading-relaxed text-[#1a1a1a] placeholder:text-[#888] font-sans outline-none"
        }
        rows={3}
      />
      {rangeMode && (
        <div
          className={
            variant === "seamless"
              ? "mx-4 mb-2 border-2 border-[#1a1a1a] bg-[#e8e8e0] px-2 py-2 text-xs"
              : "mx-3 mb-2 border-2 border-[#1a1a1a] bg-[#e8e8e0] px-2 py-2 text-xs"
          }
        >
          <div className="flex items-center gap-2">
            <Scissors className="h-3.5 w-3.5 text-[#2F6DB4]" />
            <label className="font-mono text-[#666]">In</label>
          <input
            type="text"
            value={inTime}
            onChange={(e) => handleInTimeChange(e.target.value)}
              className="w-20 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-1.5 py-0.5 font-mono text-xs text-[#1a1a1a] focus:outline-none"
            placeholder="mm:ss.ff"
          />
            <label className="font-mono text-[#666]">Out</label>
          <input
            type="text"
            value={outTime}
            onChange={(e) => handleOutTimeChange(e.target.value)}
              className="w-20 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-1.5 py-0.5 font-mono text-xs text-[#1a1a1a] focus:outline-none"
            placeholder="mm:ss.ff"
          />
            <button
              type="button"
              className="ml-auto inline-flex h-6 w-6 items-center justify-center border-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#888] hover:text-[#dc2626]"
              onClick={clearRange}
              title="Clear range"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div
          className={
            variant === "seamless"
              ? "mx-4 mb-2 border border-[#1a1a1a]/30 bg-[#e8e8e0] px-2 py-2"
              : "mx-3 mb-2 border border-[#1a1a1a]/30 bg-[#e8e8e0] px-2 py-2"
          }
        >
          <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((file, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 text-[11px] border border-[#1a1a1a]/30 px-2 py-1 bg-[#f0f0e8] text-[#1a1a1a]"
                title={file.name}
              >
                <Paperclip className="h-3.5 w-3.5 text-[#888]" />
                <span className="max-w-[180px] truncate">{file.name}</span>
                <span className="text-[#888]">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-[#888] hover:text-[#dc2626]"
                  title="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
          ))}
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.txt,.rtf,.md,.mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.gif,.webp"
        onChange={(e) => {
          if (e.target.files) {
            setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
          }
          e.target.value = "";
        }}
      />
      <div
        className={
          variant === "seamless"
            ? "flex items-center justify-between px-4 pb-3 pt-1 border-t border-[#1a1a1a]/10"
            : "flex items-center justify-between px-3 pb-3 pt-1 border-t border-[#1a1a1a]/10"
        }
      >
        <div className="flex items-center gap-1.5">
          {!parentId && (
            <>
            <Button
              type="button"
                variant={rangeMode ? "default" : "ghost"}
              size="icon"
                className={`h-8 w-8 shrink-0 ${rangeMode ? "bg-[#2F6DB4] text-white hover:bg-[#255a94]" : ""}`}
              onClick={toggleRangeMode}
              title={rangeMode ? "Disable range mode" : "Mark in/out range"}
            >
              <Scissors className="h-4 w-4" />
            </Button>
            {onDrawingRequest && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`h-8 w-8 shrink-0 ${drawingData ? "bg-[#2F6DB4]/10 text-[#2F6DB4]" : ""}`}
                onClick={onDrawingRequest}
                title="Draw annotation"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
                className={`relative h-8 w-8 shrink-0 ${pendingFiles.length > 0 ? "bg-[#2F6DB4]/10 text-[#2F6DB4]" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
                {pendingFiles.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 inline-flex items-center justify-center bg-[#2F6DB4] text-white text-[10px] font-bold border border-[#1a1a1a]">
                    {pendingFiles.length}
                  </span>
                )}
            </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
        {onCancel && (
          <Button
            type="button"
            variant={variant === "seamless" ? "ghost" : "outline"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="submit"
          variant={variant === "seamless" ? "ghost" : "primary"}
          size="icon"
          className="h-8 w-8 shrink-0 disabled:opacity-50"
          disabled={(!text.trim() && pendingFiles.length === 0) || isLoading}
        >
          <Send className="h-4 w-4" />
        </Button>
        </div>
      </div>
      </div>
    </form>
  );
}
