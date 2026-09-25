"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Mic,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const MAX_RECORDING_MS = 10 * 60 * 1000;
const VOICE_BITRATE_BPS = 64_000;
const MAX_VOICE_BYTES = 12 * 1024 * 1024;

export type VoiceDraft = {
  file: File;
  url: string;
  durationMs: number;
};

function recordingFormat() {
  const choices = [
    { mime: "audio/webm;codecs=opus", extension: "webm" },
    { mime: "audio/mp4", extension: "m4a" },
    { mime: "audio/ogg;codecs=opus", extension: "ogg" },
    { mime: "audio/webm", extension: "webm" },
  ];
  return (
    choices.find(({ mime }) => MediaRecorder.isTypeSupported(mime)) ?? {
      mime: "",
      extension: "webm",
    }
  );
}

function durationLabel(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VoiceRecorderControl({
  disabled,
  hasDraft,
  onRecorded,
  onRecordingChange,
}: {
  disabled?: boolean;
  hasDraft: boolean;
  onRecorded: (draft: VoiceDraft) => void;
  onRecordingChange: (recording: boolean) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const extensionRef = useRef("webm");

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopRecording(discard = false) {
    discardRef.current = discard;
    stopTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
    onRecordingChange(false);
  }

  useEffect(() => {
    return () => {
      stopTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        discardRef.current = true;
        recorder.stop();
      }
      releaseStream();
    };
  }, []);

  async function startRecording() {
    if (
      disabled ||
      starting ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      if (typeof MediaRecorder === "undefined") {
        toast.error("Voice recording is not supported in this browser.");
      }
      return;
    }

    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const format = recordingFormat();
      const recorder = format.mime
        ? new MediaRecorder(stream, {
            mimeType: format.mime,
            audioBitsPerSecond: VOICE_BITRATE_BPS,
          })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      extensionRef.current = format.extension;
      chunksRef.current = [];
      discardRef.current = false;
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener(
        "stop",
        () => {
          const durationMs = Math.min(
            Date.now() - startedAtRef.current,
            MAX_RECORDING_MS
          );
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          recorderRef.current = null;
          chunksRef.current = [];
          releaseStream();
          if (discardRef.current || blob.size === 0) return;
          if (blob.size > MAX_VOICE_BYTES) {
            toast.error(
              "This recording is unusually large. Try a shorter voice message."
            );
            return;
          }

          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const file = new File(
            [blob],
            `voice-message-${timestamp}.${extensionRef.current}`,
            { type: blob.type }
          );
          onRecorded({
            file,
            url: URL.createObjectURL(blob),
            durationMs,
          });
        },
        { once: true }
      );
      recorder.addEventListener(
        "error",
        () => {
          discardRef.current = true;
          stopTimer();
          setRecording(false);
          onRecordingChange(false);
          releaseStream();
          toast.error("Recording stopped unexpectedly. Please try again.");
        },
        { once: true }
      );

      recorder.start(250);
      setRecording(true);
      onRecordingChange(true);
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        setElapsedMs(Math.min(next, MAX_RECORDING_MS));
        if (next >= MAX_RECORDING_MS) stopRecording();
      }, 250);
    } catch (error) {
      releaseStream();
      toast.error(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser settings to record."
          : "Could not start voice recording."
      );
    } finally {
      setStarting(false);
    }
  }

  if (recording) {
    return (
      <div
        className="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/6 px-3"
        role="status"
        aria-live="polite"
      >
        <span className="relative flex size-3 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/45 motion-reduce:hidden" />
          <span className="relative size-3 rounded-full bg-destructive" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Recording voice message</span>
          <span className="block text-xs tabular-nums text-muted-foreground">
            {durationLabel(elapsedMs)} / 10:00
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 lg:size-9"
          aria-label="Discard recording"
          onClick={() => stopRecording(true)}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          className="size-11 lg:size-9"
          aria-label="Stop recording"
          onClick={() => stopRecording()}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 lg:size-10"
      aria-label={hasDraft ? "Record voice message again" : "Record voice message"}
      disabled={disabled || starting}
      onClick={() => void startRecording()}
    >
      {starting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : hasDraft ? (
        <RotateCcw className="size-4" />
      ) : (
        <Mic className="size-4" />
      )}
    </Button>
  );
}

export function VoiceDraftPreview({
  draft,
  disabled,
  onDiscard,
}: {
  draft: VoiceDraft;
  disabled?: boolean;
  onDiscard: () => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 rounded-xl border bg-card px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Volume2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Voice message</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {durationLabel(draft.durationMs)}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Discard voice message"
        disabled={disabled}
        onClick={onDiscard}
      >
        <Trash2 className="size-4" />
      </Button>
      <audio
        controls
        preload="metadata"
        src={draft.url}
        className="col-span-3 h-8 w-full max-w-md"
      >
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}
