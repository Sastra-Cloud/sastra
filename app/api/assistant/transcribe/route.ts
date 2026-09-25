import { NextResponse } from "next/server";

import {
  AiBudgetExceededError,
  assertCloudflareBudget,
  recordAiUsage,
} from "@/lib/ai/usage";
import {
  CLOUDFLARE_VOICE_MODEL,
  estimateAudioMinutes,
  estimateVoiceCostUsd,
  estimateVoiceNeurons,
} from "@/lib/ai/usage-costs";
import { getSession } from "@/lib/auth/guards";
import { applyVoiceDictionary } from "@/lib/dictionary/correct";
import { buildVoiceContext } from "@/lib/dictionary/hint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same Cloudflare account as R2 storage, so reuse its id if a dedicated one isn't set.
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
// Turbo model: better accents/multilingual + auto language detection.
const MODEL = CLOUDFLARE_VOICE_MODEL;
// Cap uploads so a runaway recording can't post a huge blob (~10 min of opus).
const MAX_BYTES = 25 * 1024 * 1024;

/** Transcribe a recorded audio clip via Cloudflare Workers AI (Whisper). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !session.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ACCOUNT_ID || !TOKEN) {
    return NextResponse.json(
      { error: "Voice transcription is not configured." },
      { status: 501 }
    );
  }

  const form = await request.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 413 });
  }
  const durationMs = Number(form.get("durationMs") ?? 0);
  const audioMinutes = estimateAudioMinutes({
    durationMs,
    sizeBytes: file.size,
  });

  try {
    await assertCloudflareBudget();
  } catch (e) {
    if (e instanceof AiBudgetExceededError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  // Bias transcription toward known names (product, projects, people, dictionary).
  const voiceContext = await buildVoiceContext().catch(() => ({
    initialPrompt: "",
    dictionary: [],
  }));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio: base64,
        ...(voiceContext.initialPrompt
          ? { initial_prompt: voiceContext.initialPrompt }
          : {}),
      }),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Transcription failed." }, { status: 502 });
  }

  const json = await res.json();
  const text: string = json?.result?.text ?? json?.text ?? "";
  await recordAiUsage({
    provider: "cloudflare_workers_ai",
    scope: "member",
    feature: "voice",
    operation: "transcribe",
    taskKey: "voice_transcription",
    model: MODEL,
    userId: session.user.id,
    units: estimateVoiceNeurons(audioMinutes),
    unitName: "neuron",
    costUsd: estimateVoiceCostUsd(audioMinutes),
    estimated: true,
    metadata: {
      audioMinutes,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      sizeBytes: file.size,
      mimeType: file.type,
    },
  }).catch((err) => console.error("transcription usage metering failed:", err));
  const correctedText = applyVoiceDictionary(text.trim(), voiceContext.dictionary);
  return NextResponse.json({ text: correctedText });
}
