import { VIDEO_WORKFLOW_STATUS_OPTIONS, type VideoWorkflowStatus } from "./VideoWorkflowStatusControl";
import { cn } from "@/lib/utils";

type VideoWorkflowStatusStepsProps = {
  status: VideoWorkflowStatus;
  className?: string;
};

export function VideoWorkflowStatusSteps({ status, className }: VideoWorkflowStatusStepsProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 border-2 border-[color:var(--button-border)] bg-[color:var(--button-fill)] px-1 py-1 shadow-[4px_4px_0px_0px_var(--shadow-accent)]",
        className,
      )}
      aria-label="Review status"
    >
      {VIDEO_WORKFLOW_STATUS_OPTIONS.map((option) => {
        const isActive = option.value === status;
        return (
          <span
            key={option.value}
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] border",
              isActive
                ? option.value === "approved"
                  ? "border-[#15803d] bg-[#16a34a]/20 text-[#14532d] dark:text-[#bbf7d0]"
                  : "border-[color:var(--button-border)] bg-[color:var(--accent)]/20 text-[color:var(--button-text)]"
                : "border-transparent text-[color:var(--foreground-muted)]",
            )}
          >
            {option.label}
          </span>
        );
      })}
    </div>
  );
}
