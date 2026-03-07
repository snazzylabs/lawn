const MAX_DRAWING_DIMENSION = 1600;
const DEFAULT_DRAWING_QUALITY = 0.82;

function getScaledSize(width: number, height: number) {
  if (width <= MAX_DRAWING_DIMENSION && height <= MAX_DRAWING_DIMENSION) {
    return { width, height };
  }

  if (width >= height) {
    const scale = MAX_DRAWING_DIMENSION / width;
    return {
      width: MAX_DRAWING_DIMENSION,
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  const scale = MAX_DRAWING_DIMENSION / height;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: MAX_DRAWING_DIMENSION,
  };
}

function encodeCanvas(canvas: HTMLCanvasElement, quality = DEFAULT_DRAWING_QUALITY) {
  return canvas.toDataURL("image/jpeg", quality);
}

export function optimizeCommentDrawingData(
  drawingDataUrl: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const target = getScaledSize(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(encodeCanvas(canvas));
    };
    img.onerror = () => reject(new Error("Failed to load drawing image"));
    img.src = drawingDataUrl;
  });
}

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
      const target = getScaledSize(frameImg.width, frameImg.height);
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(drawingImg, 0, 0, canvas.width, canvas.height);
      resolve(encodeCanvas(canvas));
    };

    frameImg.onload = onLoad;
    drawingImg.onload = onLoad;
    frameImg.onerror = () => reject(new Error("Failed to load frame image"));
    drawingImg.onerror = () => reject(new Error("Failed to load drawing image"));
    frameImg.src = frameDataUrl;
    drawingImg.src = drawingDataUrl;
  });
}
