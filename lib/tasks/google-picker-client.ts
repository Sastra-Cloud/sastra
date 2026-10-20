/* eslint-disable @typescript-eslint/no-explicit-any */
// Google's browser-only SDK is loaded on demand, outside the application bundle.
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let pickerLoad: Promise<void> | null = null;
const LOAD_TIMEOUT = 15_000;

/** Share concurrent SDK loads, but allow a clean retry after any failure. */
export function loadGooglePicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoad) return pickerLoad;

  pickerLoad = new Promise<void>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (script) {
        script.onload = null;
        script.onerror = null;
        if (error) script.remove();
      }
      if (error) reject(error);
      else resolve();
    };
    // This includes api.js itself, not only the later gapi.load('picker') call.
    const timeout = setTimeout(
      () => finish(new Error("Google Picker took too long to load")),
      LOAD_TIMEOUT
    );
    const ready = () => {
      if (settled) return;
      try {
        window.gapi.load("picker", {
          callback: () => finish(window.google?.picker ? undefined : new Error("Google Picker is unavailable")),
          onerror: () => finish(new Error("Google Picker failed to load")),
          timeout: LOAD_TIMEOUT,
          ontimeout: () => finish(new Error("Google Picker took too long to load")),
        });
      } catch {
        finish(new Error("Google Picker failed to load"));
      }
    };
    if (window.gapi?.load) {
      ready();
    } else {
      script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = ready;
      script.onerror = () => finish(new Error("Google Picker failed to load"));
      document.body.appendChild(script);
    }
  }).catch((error) => {
    pickerLoad = null;
    throw error;
  });
  return pickerLoad;
}

/** Bound token refresh too, so a stalled server cannot leave the button disabled. */
export async function prepareGooglePicker(
  getToken: () => Promise<string | null>,
  signal: AbortSignal
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let aborted: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const [token] = await Promise.race([
      Promise.all([getToken(), loadGooglePicker()]),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Google Drive took too long to open")), LOAD_TIMEOUT);
        aborted = () => reject(new DOMException("Picker opening canceled", "AbortError"));
        signal.addEventListener("abort", aborted, { once: true });
      }),
    ]);
    return token;
  } finally {
    clearTimeout(timeout);
    if (aborted) signal.removeEventListener("abort", aborted);
  }
}

/**
 * Watch the iframe transport load, not just setVisible(). Google has no public
 * "file list ready" event; a frame load does not guarantee its API requests succeed.
 * Keep Google's ERROR callback active after opening and dispose on every exit.
 */
export function showGooglePicker(
  builder: any,
  {
    signal,
    onPicked,
    onError,
  }: {
    signal: AbortSignal;
    onPicked: (data: any) => void | Promise<void>;
    onError: (error: Error) => void;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = new Set(document.querySelectorAll<HTMLIFrameElement>(".picker-dialog iframe"));
    let picker: any;
    let frame: HTMLIFrameElement | undefined;
    let opened = false;
    let closed = false;
    const loaded = () => {
      if (closed) return;
      opened = true;
      clearTimeout(timeout);
      observer.disconnect();
      frame?.removeEventListener("load", loaded);
      resolve();
    };
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      observer.disconnect();
      frame?.removeEventListener("load", loaded);
      signal.removeEventListener("abort", aborted);
      picker?.dispose();
      if (error) {
        if (opened) onError(error);
        else reject(error);
      } else resolve();
    };
    const aborted = () => close();
    const observeFrame = () => {
      if (frame) return;
      frame = Array.from(document.querySelectorAll<HTMLIFrameElement>(".picker-dialog iframe"))
        .find((item) => !existing.has(item));
      frame?.addEventListener("load", loaded);
    };
    const observer = new MutationObserver(observeFrame);
    const timeout = setTimeout(
      () => close(new Error("Google Drive took too long to open")),
      20_000
    );
    if (signal.aborted) {
      close();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      picker = builder.setCallback((data: any) => {
        if (closed) return;
        const action = window.google.picker.Action;
        if (data.action === action.ERROR) {
          close(new Error("Google Picker reported an error"));
        } else if (data.action === action.CANCEL) {
          close();
        } else if (data.action === action.PICKED) {
          close();
          void Promise.resolve().then(() => onPicked(data)).catch(onError);
        }
      }).build();
      observeFrame();
      picker.setVisible(true);
      observeFrame();
    } catch {
      close(new Error("Google Picker could not open"));
    }
  });
}
