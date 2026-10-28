import { afterEach, expect, it, vi } from "vitest";
import { uploadFileBytes } from "./upload-progress";

afterEach(() => vi.unstubAllGlobals());

it("reports bytes while pending and rejects a failed PUT instead of reporting completion", async () => {
  const request = {
    upload: { onprogress: vi.fn<(event: { lengthComputable: boolean; loaded: number; total: number }) => void>() },
    status: 0, onload: vi.fn(), open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(),
  };
  vi.stubGlobal("XMLHttpRequest", class { constructor() { return request; } });
  const progress = vi.fn();
  const upload = uploadFileBytes("https://uploads.test/video", new File(["video"], "clip.mp4"), progress);
  request.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
  expect(progress).toHaveBeenLastCalledWith(0.5);
  request.status = 503;
  request.onload();
  await expect(upload).rejects.toThrow("try again");
  expect(progress).not.toHaveBeenCalledWith(1);
});
