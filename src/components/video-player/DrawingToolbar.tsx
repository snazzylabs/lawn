"use client";

import { Pencil, MoveUpRight, Square, Circle, Undo2, Trash2, Check } from "lucide-react";
import type { DrawingTool } from "./DrawingCanvas";
import { cn } from "@/lib/utils";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];

interface DrawingToolbarProps {
  tool: DrawingTool;
  color: string;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
  onCancel?: () => void;
}

const tools: { id: DrawingTool; icon: typeof Pencil; label: string }[] = [
  { id: "pen", icon: Pencil, label: "Pen" },
  { id: "arrow", icon: MoveUpRight, label: "Arrow" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
];

export function DrawingToolbar({
  tool,
  color,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
  onDone,
  onCancel,
}: DrawingToolbarProps) {
  return (
    <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1.5 text-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)]">
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onToolChange(id)}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center border-2 border-transparent transition",
            tool === id
              ? "border-[#1a1a1a] bg-[#2F6DB4] text-white"
              : "hover:border-[#1a1a1a]/40 hover:bg-[#e8e8e0]"
          )}
          title={label}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}

      <div className="mx-1 h-5 w-px bg-[#1a1a1a]/20" />

      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onColorChange(c)}
          className={cn(
            "h-5 w-5 rounded-full border-2 transition",
            color === c ? "border-[#1a1a1a] scale-110" : "border-[#1a1a1a]/40 hover:border-[#1a1a1a]"
          )}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}

      <div className="mx-1 h-5 w-px bg-[#1a1a1a]/20" />

      <button
        type="button"
        onClick={onUndo}
        className="inline-flex h-8 w-8 items-center justify-center border-2 border-transparent transition hover:border-[#1a1a1a]/40 hover:bg-[#e8e8e0]"
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 w-8 items-center justify-center border-2 border-transparent transition hover:border-[#1a1a1a]/40 hover:bg-[#e8e8e0]"
        title="Clear"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-[#1a1a1a]/20" />

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center justify-center border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 text-xs font-bold uppercase tracking-wide transition hover:bg-[#e8e8e0]"
          title="Cancel drawing"
        >
          Cancel
        </button>
      )}

      <button
        type="button"
        onClick={onDone}
        className="inline-flex h-8 items-center justify-center gap-1 border-2 border-[#1a1a1a] bg-[#2F6DB4] px-3 text-xs font-bold text-white transition hover:bg-[#255a94]"
        title="Done drawing"
      >
        <Check className="h-3.5 w-3.5" />
        Done
      </button>
    </div>
  );
}
