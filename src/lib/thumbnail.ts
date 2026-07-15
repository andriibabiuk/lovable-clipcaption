export async function captureThumbnail(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      try {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.1);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onseeked = () => {
      try {
        const w = 320;
        const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 9 / 16;
        const h = Math.round(w * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve(dataUrl);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}