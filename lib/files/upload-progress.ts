/** XHR is used for byte-level upload progress; fetch currently has no portable upload progress API. */
export function uploadFileBytes(url: string, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(0.99, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { onProgress(1); resolve(); }
      else reject(new Error("Upload failed. Check your connection and try again."));
    };
    request.onerror = request.ontimeout = () => reject(new Error("Upload stopped. Check your connection and try again."));
    request.onabort = () => reject(new Error("Upload stopped. Try sending the file again."));
    request.send(file);
  });
}
