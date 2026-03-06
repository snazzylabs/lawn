export const OPEN_HELP_EVENT = "snazzy:open-help";
export const ATTACH_COMMENT_FILES_EVENT = "snazzy:attach-comment-files";

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || el.isContentEditable;
}

function isVisibleElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  return el.offsetParent !== null || style.position === "fixed";
}

export function focusVisibleCommentInput(): boolean {
  const candidates = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-comment-hotkey-target="true"]'),
  );
  const target = candidates.find((el) => !el.disabled && !el.readOnly && isVisibleElement(el));
  if (!target) {
    return false;
  }
  target.focus();
  const length = target.value.length;
  target.setSelectionRange(length, length);
  return true;
}

export function focusVisibleCommentInputSoon(maxAttempts = 10, intervalMs = 40): void {
  if (focusVisibleCommentInput()) {
    return;
  }

  let attempts = 0;
  const intervalId = window.setInterval(() => {
    attempts += 1;
    if (focusVisibleCommentInput() || attempts >= maxAttempts) {
      window.clearInterval(intervalId);
    }
  }, intervalMs);
}
