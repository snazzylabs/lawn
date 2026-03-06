"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, MessageSquareText, Scissors, Pencil, Paperclip } from "lucide-react";
import { OPEN_HELP_EVENT } from "@/lib/commentHotkeys";
import { cn } from "@/lib/utils";

const SHORTCUTS = [
  { keys: ["Space"], description: "Play/Pause (outside text fields)" },
  { keys: ["N"], description: "Focus new comment" },
  { keys: ["I"], description: "Mark In point at current time" },
  { keys: ["O"], description: "Mark Out point and focus comment" },
  { keys: ["?"], description: "Open this help menu" },
  { keys: ["Enter"], description: "Submit comment" },
  { keys: ["Shift", "Enter"], description: "New line in comment" },
  { keys: ["Esc"], description: "Cancel editing / close" },
] as const;

const TOOLS = [
  { name: "Timestamped Comments", description: "Comments pin to the current playback time", icon: MessageSquareText },
  { name: "In/Out Ranges", description: "Press I then O to mark a range on the timeline", icon: Scissors },
  { name: "Draw on Frame", description: "Annotate directly on the video frame", icon: Pencil },
  { name: "Attach Files", description: "Upload PDFs, images, or videos with your notes", icon: Paperclip },
] as const;

type HelpButtonProps = {
  className?: string;
  variant?: "ghost" | "outline";
};

export function HelpButton({
  className,
  variant = "ghost",
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_HELP_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_HELP_EVENT, handleOpen);
  }, []);

  return (
    <>
      <Button
        variant={variant}
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={() => setOpen(true)}
        title="Help & shortcuts"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.description} className="flex items-center justify-between text-sm">
                  <span className="text-[#1a1a1a]">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 border-2 border-[#1a1a1a] bg-[#e8e8e0] text-xs font-mono font-bold text-[#1a1a1a]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-[#1a1a1a]/10 pt-4">
              <h3 className="text-sm font-bold text-[#1a1a1a] mb-2">Tools</h3>
              <div className="space-y-2">
                {TOOLS.map((tool) => (
                  <div key={tool.name} className="text-sm flex items-start gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-[#1a1a1a] bg-[#e8e8e0] text-[#1a1a1a] shrink-0">
                      <tool.icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <span className="font-bold text-[#1a1a1a]">{tool.name}</span>
                      <span className="text-[#888] ml-1.5">— {tool.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
