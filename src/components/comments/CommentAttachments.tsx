"use client";

import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface CommentAttachment {
  _id?: string;
  filename: string;
  fileSize: number;
  contentType?: string;
  s3Key?: string;
  url?: string;
}

interface CommentAttachmentsProps {
  attachments?: CommentAttachment[];
  className?: string;
}

export function CommentAttachments({ attachments, className }: CommentAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className={className ?? "mt-2 flex flex-wrap gap-1.5"}>
      {attachments.map((attachment, idx) => {
        const href = attachment.url;
        const key =
          attachment._id ??
          `${attachment.s3Key ?? attachment.filename}-${idx}`;

        if (!href) {
          return (
            <div
              key={key}
              className="inline-flex items-center gap-1.5 border border-[#1a1a1a]/30 px-2 py-1 text-xs bg-[#f0f0e8] text-[#1a1a1a]"
            >
              <Paperclip className="h-3.5 w-3.5 text-[#888]" />
              <span
                className="max-w-[220px] truncate"
                title={attachment.filename}
              >
                {attachment.filename}
              </span>
              <span className="text-[#888]">{formatBytes(attachment.fileSize)}</span>
            </div>
          );
        }

        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-[#1a1a1a]/30 px-2 py-1 text-xs bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#e8e8e0] transition-colors"
            title={attachment.filename}
          >
            <Paperclip className="h-3.5 w-3.5 text-[#888]" />
            <span className="max-w-[220px] truncate">{attachment.filename}</span>
            <span className="text-[#888]">{formatBytes(attachment.fileSize)}</span>
          </a>
        );
      })}
    </div>
  );
}
