"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESET_EMOJIS = ["👍", "✅", "🔥", "👀", "❓"];

interface EmojiReactionPickerProps {
  commentId: Id<"comments">;
  reactions?: Array<{ emoji: string; count: number; userIdentifiers: string[] }>;
  currentUserIdentifier: string;
  currentUserName: string;
}

export function EmojiReactionPicker({
  commentId,
  reactions = [],
  currentUserIdentifier,
  currentUserName,
}: EmojiReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const addReaction = useMutation(api.comments.addReaction);
  const removeReaction = useMutation(api.comments.removeReaction);

  const handleToggleReaction = async (emoji: string) => {
    const existing = reactions.find((r) => r.emoji === emoji);
    const hasReacted = existing?.userIdentifiers.includes(currentUserIdentifier);

    if (hasReacted) {
      await removeReaction({ commentId, emoji, userIdentifier: currentUserIdentifier });
    } else {
      await addReaction({ commentId, emoji, userIdentifier: currentUserIdentifier, userName: currentUserName });
    }
    setShowPicker(false);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIdentifiers.includes(currentUserIdentifier);
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => void handleToggleReaction(reaction.emoji)}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs border-2 transition-colors",
              hasReacted
                ? "border-[#2F6DB4] bg-[#2F6DB4]/10 text-[#2F6DB4]"
                : "border-[#ccc] bg-[#f0f0e8] text-[#1a1a1a] hover:border-[#1a1a1a]",
            )}
          >
            <span>{reaction.emoji}</span>
            <span className="font-mono font-bold">{reaction.count}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center h-6 w-6 text-[#888] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#ccc] transition-colors"
          title="Add reaction"
        >
          <Plus className="h-3 w-3" />
        </button>

        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 border-2 border-[#1a1a1a] bg-[#f0f0e8] p-1 shadow-[4px_4px_0px_0px_var(--shadow-color)] z-10">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void handleToggleReaction(emoji)}
                className="h-7 w-7 flex items-center justify-center hover:bg-[#e8e8e0] transition-colors text-sm"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
