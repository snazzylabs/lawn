export function compositeDrawingOnFrame(
  frameDataUrl: string,
  drawingDataUrl: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const frameImg = new Image();
    const drawingImg = new Image();
    let loaded = 0;

    const onLoad = () => {
      loaded++;
      if (loaded < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = frameImg.width;
      canvas.height = frameImg.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(frameImg, 0, 0);
      ctx.drawImage(drawingImg, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };

    frameImg.onload = onLoad;
    drawingImg.onload = onLoad;
    frameImg.onerror = () => reject(new Error("Failed to load frame image"));
    drawingImg.onerror = () => reject(new Error("Failed to load drawing image"));
    frameImg.src = frameDataUrl;
    drawingImg.src = drawingDataUrl;
  });
}
