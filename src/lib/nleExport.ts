interface ExportComment {
  text: string;
  userName: string;
  timestampSeconds: number;
  endTimestampSeconds?: number;
}

function secondsToTimecode(seconds: number, fps: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.round((seconds % 1) * fps);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function secondsToHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function exportToFCPXML(
  comments: ExportComment[],
  videoTitle: string,
  fps = 30,
): string {
  const markers = comments
    .map((c) => {
      const startFrames = Math.round(c.timestampSeconds * fps);
      const durationFrames = c.endTimestampSeconds
        ? Math.round((c.endTimestampSeconds - c.timestampSeconds) * fps)
        : 1;
      return `        <marker start="${startFrames}/${fps}s" duration="${durationFrames}/${fps}s" value="${escapeXml(`[${c.userName}] ${c.text}`)}" />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" frameDuration="1/${fps}s" />
  </resources>
  <library>
    <event name="${escapeXml(videoTitle)} - Comments">
      <project name="${escapeXml(videoTitle)}">
        <sequence format="r1">
          <spine>
${markers}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

export function exportToPremiereCSV(comments: ExportComment[]): string {
  const header = "Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type";
  const rows = comments.map((c) => {
    const inTC = secondsToHMS(c.timestampSeconds);
    const outTC = c.endTimestampSeconds
      ? secondsToHMS(c.endTimestampSeconds)
      : secondsToHMS(c.timestampSeconds + 0.033);
    const duration = c.endTimestampSeconds
      ? secondsToHMS(c.endTimestampSeconds - c.timestampSeconds)
      : secondsToHMS(0.033);
    return `${c.userName}\t${c.text.replace(/[\t\n\r]/g, " ")}\t${inTC}\t${outTC}\t${duration}\tComment`;
  });
  return [header, ...rows].join("\n");
}

export function exportToDaVinciEDL(
  comments: ExportComment[],
  videoTitle: string,
  fps = 30,
): string {
  const lines = [`TITLE: ${videoTitle} - Comments`, ""];
  comments.forEach((c, i) => {
    const num = String(i + 1).padStart(3, "0");
    const srcIn = secondsToTimecode(c.timestampSeconds, fps);
    const srcOut = c.endTimestampSeconds
      ? secondsToTimecode(c.endTimestampSeconds, fps)
      : secondsToTimecode(c.timestampSeconds + 1 / fps, fps);
    lines.push(`${num}  001      V     C        ${srcIn} ${srcOut} ${srcIn} ${srcOut}`);
    lines.push(`* FROM CLIP NAME: ${videoTitle}`);
    lines.push(`* COMMENT: [${c.userName}] ${c.text.replace(/[\n\r]/g, " ")}`);
    lines.push("");
  });
  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadFCPXML(comments: ExportComment[], videoTitle: string, fps = 30) {
  const content = exportToFCPXML(comments, videoTitle, fps);
  downloadBlob(content, `${videoTitle}-markers.fcpxml`, "application/xml");
}

export function downloadPremiereCSV(comments: ExportComment[], videoTitle: string) {
  const content = exportToPremiereCSV(comments);
  downloadBlob(content, `${videoTitle}-markers.tsv`, "text/tab-separated-values");
}

export function downloadDaVinciEDL(comments: ExportComment[], videoTitle: string, fps = 30) {
  const content = exportToDaVinciEDL(comments, videoTitle, fps);
  downloadBlob(content, `${videoTitle}-markers.edl`, "text/plain");
}
