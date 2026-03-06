"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, Scissors, Pencil, Paperclip } from "lucide-react";

interface GuestOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (name: string, company?: string) => void;
}

const STEPS = [
  {
    icon: MessageSquare,
    title: "Timestamped Comments",
    description: "Comments pin to the current playback time",
  },
  {
    icon: Scissors,
    title: "In/Out Ranges",
    description: "Mark a start and end point for precise notes",
  },
  {
    icon: Pencil,
    title: "Draw on Frame",
    description: "Annotate directly on the video",
  },
  {
    icon: Paperclip,
    title: "Attach Files",
    description: "Upload PDFs, images, or videos with your notes",
  },
] as const;

export function GuestOnboardingDialog({
  open,
  onOpenChange,
  onComplete,
}: GuestOnboardingDialogProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onComplete(name.trim(), company.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">LEAVE FEEDBACK</DialogTitle>
          <DialogDescription className="text-[#888]">
            Enter your name to start reviewing
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name *"
              autoFocus
              className="w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#888] focus:outline-none"
            />
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company (optional)"
              className="w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#888] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {STEPS.map((step) => (
              <div key={step.title} className="text-center space-y-2 p-3">
                <div className="mx-auto w-12 h-12 border-2 border-[#1a1a1a] flex items-center justify-center">
                  <step.icon className="h-6 w-6 text-[#2F6DB4]" />
                </div>
                <div className="text-xs font-bold uppercase tracking-tight text-[#1a1a1a]">
                  {step.title}
                </div>
                <p className="text-[11px] text-[#888] leading-snug">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <Button
            type="submit"
            disabled={!name.trim()}
            className="w-full bg-[#2F6DB4] hover:bg-[#4DA7F8] text-[#f0f0e8] font-bold"
          >
            Start Reviewing
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
