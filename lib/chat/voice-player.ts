import { recoverVoiceDuration } from "./voice-playback";

export type VoiceSource = { id: string; src: string; durationMs?: number };
export type VoicePlayback = {
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  currentTime: number;
  duration: number;
  error: string | null;
};
const EMPTY: VoicePlayback = { status: "idle", currentTime: 0, duration: 0, error: null };
const LOAD_TIMEOUT_MS = 15_000;
const REFRESH_AFTER_MS = 4 * 60 * 1000;

/** One native media element per signed-in app, allocated only on a Play gesture. */
export class VoicePlayer {
  private audio: HTMLAudioElement | null = null;
  private source: VoiceSource | null = null;
  private states = new Map<string, VoicePlayback>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private loadedAt = 0;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recover: (() => void) | undefined;
  private detach: Array<() => void> = [];
  private restoreTime = 0;
  private disposed = false;
  private hasResource = false;

  constructor(
    private createAudio: () => HTMLAudioElement = () => new Audio(),
    private now = Date.now,
    private session?: MediaSession,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  snapshot = (id: string) => this.states.get(id) ?? EMPTY;
  serverSnapshot = () => EMPTY;

  private update(change: Partial<VoicePlayback>) {
    if (!this.source || this.disposed) return;
    this.states.set(this.source.id, { ...this.snapshot(this.source.id), ...change });
    // Bound retained resume positions across a long signed-in session.
    if (this.states.size > 128) this.states.delete(this.states.keys().next().value!);
    this.listeners.forEach(listener => listener());
    this.syncSession();
  }

  private getAudio() {
    if (this.audio) return this.audio;
    const audio = this.createAudio();
    this.audio = audio;
    if (!this.session && typeof navigator !== "undefined") this.session = navigator.mediaSession;
    audio.preload = "none";
    audio.setAttribute("playsinline", "");
    const on = (name: string, listener: () => void) => {
      audio.addEventListener(name, listener);
      this.detach.push(() => audio.removeEventListener(name, listener));
    };
    const duration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) this.update({ duration: audio.duration });
    };
    on("loadedmetadata", () => {
      duration();
      if (this.restoreTime > 0) {
        audio.currentTime = this.restoreTime;
        this.restoreTime = 0;
      }
    });
    on("durationchange", duration);
    on("playing", () => {
      if (!audio.paused) {
        clearTimeout(this.timer);
        this.update({ status: "playing", error: null });
      }
    });
    on("waiting", () => {
      if (!audio.paused) { this.update({ status: "loading" }); this.watchLoad(); }
    });
    on("pause", () => {
      if (audio.paused && this.source && !["ended", "error"].includes(this.snapshot(this.source.id).status)) {
        clearTimeout(this.timer);
        this.update({ status: "paused" });
      }
    });
    on("timeupdate", () => {
      if (!this.hasResource || !this.source || !["playing", "paused"].includes(this.snapshot(this.source.id).status)) return;
      const time = audio.currentTime;
      if (Number.isFinite(time) && time >= 0 && time < Number.MAX_SAFE_INTEGER) {
        const known = this.source ? this.snapshot(this.source.id).duration : 0;
        if (!known || time <= known + 1) this.update({ currentTime: time });
      }
    });
    on("ended", () => {
      clearTimeout(this.timer);
      this.update({ status: "ended", currentTime: 0 });
    });
    on("error", () => {
      // A queued event from the old resource must not poison the new source.
      if (audio.error) this.fail("Could not load this recording. Try again or download a copy.");
    });
    this.bindSession();
    return audio;
  }

  private watchLoad() {
    clearTimeout(this.timer);
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation === this.generation) this.fail("Audio is taking too long to load. Try again.");
    }, LOAD_TIMEOUT_MS);
  }

  private fail(error: string) {
    this.generation++;
    clearTimeout(this.timer);
    this.audio?.pause();
    this.unload();
    this.update({ status: "error", error });
  }

  play = (source: VoiceSource, forceReload = false) => {
    if (this.disposed) return;
    const previous = this.source;
    const state = this.snapshot(source.id);
    if (!forceReload && previous?.id === source.id && ["loading", "playing"].includes(state.status)) {
      this.pause();
      return;
    }
    const generation = ++this.generation;
    clearTimeout(this.timer);
    const audio = this.getAudio();
    audio.pause();
    if (previous?.id !== source.id) this.update({ status: "idle" });
    const reload = forceReload || previous?.id !== source.id || previous.src !== source.src || state.status === "error"
      || this.now() - this.loadedAt >= REFRESH_AFTER_MS;
    this.source = source;
    this.update({ status: "loading", error: null, duration: state.duration || (source.durationMs ?? 0) / 1000 });
    if (reload) {
      this.recover?.();
      this.recover = undefined;
      this.restoreTime = state.status === "ended" ? 0 : state.currentTime;
      // Re-enter the authenticated route on retry; never retain a signed URL.
      const separator = source.src.includes("?") ? "&" : "?";
      this.attempt++;
      audio.src = /^(blob:|data:)/.test(source.src) ? source.src
        : `${source.src}${separator}voiceAttempt=${this.attempt}`;
      this.hasResource = true;
      audio.load();
      this.loadedAt = this.now();
      if (!this.snapshot(source.id).duration) this.recover = recoverVoiceDuration(audio);
    }
    this.watchLoad();
    // Keep this call synchronous with the click, including a retry after idle.
    try {
      void audio.play().catch((error: unknown) => {
        if (generation !== this.generation || this.disposed) return;
        if (error instanceof Error && error.name === "AbortError") {
          clearTimeout(this.timer);
          this.update({ status: "paused", error: null });
        } else {
          this.fail(error instanceof Error && error.name === "NotAllowedError"
            ? "Playback was interrupted or blocked. Press Play to try again."
            : "Could not play the audio. Try again or download the recording.");
        }
      });
    } catch {
      this.fail("Could not start playback. Press Play to try again.");
    }
  };

  pause = (id?: string) => {
    if (id && this.source?.id !== id) return;
    this.generation++;
    clearTimeout(this.timer);
    const loading = this.source && this.snapshot(this.source.id).status === "loading";
    this.audio?.pause();
    if (loading) this.unload();
    if (this.source && this.snapshot(this.source.id).status !== "error") this.update({ status: "paused" });
  };

  private unload() {
    this.hasResource = false;
    this.recover?.();
    this.recover = undefined;
    if (this.audio) { this.audio.removeAttribute("src"); this.audio.load(); }
    this.loadedAt = -Infinity;
  }

  reconcile = () => {
    if (this.audio?.paused && this.source && ["playing", "loading"].includes(this.snapshot(this.source.id).status)) this.pause();
  };

  seek = (id: string, seconds: number) => {
    if (this.source?.id !== id || !this.audio || !Number.isFinite(seconds)) return;
    const state = this.snapshot(id);
    if (!state.duration || state.status === "loading") return;
    const time = Math.max(0, Math.min(seconds, state.duration));
    if (this.hasResource) this.audio.currentTime = time;
    this.update({ currentTime: time });
  };

  private bindSession() {
    if (this.session && typeof MediaMetadata !== "undefined") {
      this.session.metadata = new MediaMetadata({ title: "Voice message" });
    }
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => { if (this.source && !["playing", "loading"].includes(this.snapshot(this.source.id).status)) this.play(this.source); }],
      ["pause", () => this.pause()],
      ["seekto", details => { if (this.source && details.seekTime !== undefined) this.seek(this.source.id, details.seekTime); }],
    ];
    for (const [action, handler] of actions) {
      try { this.session?.setActionHandler(action, handler); } catch { /* Optional OS action. */ }
    }
  }

  private syncSession() {
    if (!this.session || !this.source) return;
    const state = this.snapshot(this.source.id);
    try {
      this.session.playbackState = state.status === "playing" ? "playing" : "paused";
      if (state.duration > 0 && Number.isFinite(state.duration)) this.session.setPositionState?.({
        duration: state.duration, playbackRate: 1, position: Math.min(state.currentTime, state.duration),
      });
    } catch { /* Unsupported position reporting must not break playback. */ }
  }

  dispose = () => {
    this.pause();
    this.recover?.();
    this.recover = undefined;
    this.detach.forEach(remove => remove());
    this.detach = [];
    this.hasResource = false;
    if (this.audio) { this.audio.removeAttribute("src"); this.audio.load(); }
    for (const action of ["play", "pause", "seekto"] as const) {
      try { this.session?.setActionHandler(action, null); } catch { /* Optional API. */ }
    }
    if (this.session) this.session.metadata = null;
    this.audio = null;
    this.source = null;
    this.states.clear();
    this.disposed = true;
  };

  connect = () => {
    this.disposed = false;
    return this.dispose;
  };
}
