"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

const SHORTCUTS = [
  { keys: ["I"], description: "Set In point at current time" },
  { keys: ["O"], description: "Set Out point at current time" },
  { keys: ["Enter"], description: "Submit comment" },
  { keys: ["Shift", "Enter"], description: "New line in comment" },
  { keys: ["Esc"], description: "Cancel editing / close" },
] as const;

const TOOLS = [
  { name: "Timestamped Comments", description: "Comments pin to the current playback time" },
  { name: "In/Out Ranges", description: "Press I and O to mark a range on the timeline" },
  { name: "Draw on Frame", description: "Annotate directly on the video frame" },
  { name: "Attach Files", description: "Upload PDFs, images, or videos with your notes" },
] as const;

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
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
                  <div key={tool.name} className="text-sm">
                    <span className="font-bold text-[#1a1a1a]">{tool.name}</span>
                    <span className="text-[#888] ml-1.5">— {tool.description}</span>
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
