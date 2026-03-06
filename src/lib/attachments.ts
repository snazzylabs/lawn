const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  rtf: "text/rtf",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

export function resolveAttachmentContentType(file: File): string {
  if (file.type) {
    return file.type;
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}
