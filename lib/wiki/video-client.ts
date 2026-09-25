import {
  validateWikiVideoInspection,
  type WikiVideoInspection,
} from "./video";

const POSTER_MAX_WIDTH = 1280;
const POSTER_MAX_HEIGHT = 720;

export type InspectedWikiVideo = WikiVideoInspection & {
  poster: Blob;
};

function posterDimensions(width: number, height: number) {
  const scale = Math.min(1, POSTER_MAX_WIDTH / width, POSTER_MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not create the video preview."))),
      "image/jpeg",
      0.82
    );
  });
}

export function inspectWikiVideo(file: File): Promise<InspectedWikiVideo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let finished = false;
    const timeout = window.setTimeout(
      () => finish(new Error("Sastra could not inspect this video. Convert it to a standard MP4 and try again.")),
      20_000
    );

    function cleanup() {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    }

    function finish(error?: Error, result?: InspectedWikiVideo) {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else if (result) resolve(result);
    }

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onerror = () =>
      finish(new Error("This MP4 cannot be decoded by your browser. Convert it to H.264/AAC and try again."));
    video.onloadedmetadata = () => {
      const inspection: WikiVideoInspection = {
        contentType: file.type || "video/mp4",
        fileName: file.name,
        sizeBytes: file.size,
        durationSeconds: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      const validationError = validateWikiVideoInspection(inspection);
      if (validationError) {
        finish(new Error(validationError));
        return;
      }

      const capture = async () => {
        try {
          const dimensions = posterDimensions(video.videoWidth, video.videoHeight);
          const canvas = document.createElement("canvas");
          canvas.width = dimensions.width;
          canvas.height = dimensions.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not create the video preview.");
          context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
          finish(undefined, { ...inspection, poster: await canvasJpeg(canvas) });
        } catch (cause) {
          finish(cause instanceof Error ? cause : new Error("Could not create the video preview."));
        }
      };

      video.onseeked = () => void capture();
      video.currentTime = Math.min(0.1, Math.max(0, video.duration / 2));
    };
    video.src = objectUrl;
  });
}
