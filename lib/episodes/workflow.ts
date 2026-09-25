import type { ProjectKind, VideoProductionMode } from "@/lib/projects/kinds";

export const PODCAST_STAGES = [
  "concept_outline",
  "write_script",
  "approve_script",
  "translate_script",
  "approve_translation",
  "record_audio",
  "master_audio",
  "produce_video",
  "approve_video",
  "schedule_episode",
] as const;

export type PodcastStage = (typeof PODCAST_STAGES)[number];
export type PodcastTaskStatus = "todo" | "in_progress" | "review" | "done";

export const PODCAST_STAGE_META: Record<
  PodcastStage,
  { label: string; shortLabel: string; defaultDaysBeforePublication: number }
> = {
  concept_outline: {
    label: "Create concept and outline",
    shortLabel: "Concept",
    defaultDaysBeforePublication: 42,
  },
  write_script: {
    label: "Write script",
    shortLabel: "Script",
    defaultDaysBeforePublication: 35,
  },
  approve_script: {
    label: "Review and approve script",
    shortLabel: "Script review",
    defaultDaysBeforePublication: 28,
  },
  translate_script: {
    label: "Translate script",
    shortLabel: "Translate",
    defaultDaysBeforePublication: 42,
  },
  approve_translation: {
    label: "Edit and approve translation",
    shortLabel: "Translation QC",
    defaultDaysBeforePublication: 35,
  },
  record_audio: {
    label: "Record audio",
    shortLabel: "Record",
    defaultDaysBeforePublication: 28,
  },
  master_audio: {
    label: "Edit and master audio",
    shortLabel: "Audio master",
    defaultDaysBeforePublication: 21,
  },
  produce_video: {
    label: "Produce video",
    shortLabel: "Video",
    defaultDaysBeforePublication: 14,
  },
  approve_video: {
    label: "Review and approve video",
    shortLabel: "Video review",
    defaultDaysBeforePublication: 7,
  },
  schedule_episode: {
    label: "Schedule episode",
    shortLabel: "Schedule",
    defaultDaysBeforePublication: 2,
  },
};

export const AUDIO_STAGES: PodcastStage[] = ["record_audio", "master_audio"];
export const VIDEO_STAGES: PodcastStage[] = ["produce_video", "approve_video"];
export const TRANSLATION_STAGES: PodcastStage[] = [
  "translate_script",
  "approve_translation",
];
export const ORIGINAL_VIDEO_EDITORIAL_STAGES: PodcastStage[] = [
  "concept_outline",
  "write_script",
  "approve_script",
];

export type EpisodicWorkflowProfile = {
  kind: Extract<ProjectKind, "podcast" | "video_series">;
  videoProductionMode?: VideoProductionMode | null;
  videoRequired: boolean;
};

export function workflowProfile(input: {
  kind: string | null | undefined;
  videoProductionMode?: string | null;
  videoRequired?: boolean;
}): EpisodicWorkflowProfile {
  if (input.kind === "video_series") {
    return {
      kind: "video_series",
      videoProductionMode:
        input.videoProductionMode === "translation" ? "translation" : "original",
      videoRequired: true,
    };
  }
  return {
    kind: "podcast",
    videoProductionMode: null,
    videoRequired: input.videoRequired ?? true,
  };
}

function profileFrom(
  input: boolean | EpisodicWorkflowProfile
): EpisodicWorkflowProfile {
  return typeof input === "boolean"
    ? { kind: "podcast", videoProductionMode: null, videoRequired: input }
    : input;
}

export type EpisodeProductionStatus =
  | "Setup incomplete"
  | "Not started"
  | "Developing concept"
  | "Ready to write script"
  | "Writing script"
  | "Ready for script review"
  | "Reviewing script"
  | "Translating"
  | "Ready for translation review"
  | "Reviewing translation"
  | "Ready to record"
  | "Recording audio"
  | "Ready for audio mastering"
  | "Mastering audio"
  | "Ready for video production"
  | "Producing video"
  | "Ready for video review"
  | "Reviewing video"
  | "Ready to schedule"
  | "Scheduled"
  | "Published";

export const BULK_PRODUCTION_STATUSES = [
  "Not started",
  "Translating",
  "Ready for translation review",
  "Reviewing translation",
  "Ready to record",
  "Recording audio",
  "Ready for audio mastering",
  "Mastering audio",
  "Ready for video production",
  "Producing video",
  "Ready for video review",
  "Reviewing video",
  "Ready to schedule",
] as const satisfies readonly EpisodeProductionStatus[];

export const ORIGINAL_VIDEO_PRODUCTION_STATUSES = [
  "Developing concept",
  "Ready to write script",
  "Writing script",
  "Ready for script review",
  "Reviewing script",
] as const satisfies readonly EpisodeProductionStatus[];

export const ALL_BULK_PRODUCTION_STATUSES = [
  ...BULK_PRODUCTION_STATUSES,
  ...ORIGINAL_VIDEO_PRODUCTION_STATUSES,
] as const;

export type BulkProductionStatus =
  (typeof ALL_BULK_PRODUCTION_STATUSES)[number];

type StatusByStage = Partial<Record<PodcastStage, PodcastTaskStatus>>;

const done = (statuses: StatusByStage, stage: PodcastStage) =>
  statuses[stage] === "done";
const started = (statuses: StatusByStage, stage: PodcastStage) => {
  const status = statuses[stage];
  return status != null && status !== "todo";
};

/** Derive the episode status from publishing state and standard stage tasks. */
export function deriveEpisodeProductionStatus(input: {
  publishingStatus: "draft" | "scheduled" | "published";
  videoRequired: boolean;
  workflowProfile?: EpisodicWorkflowProfile;
  statuses: StatusByStage;
  workflowComplete?: boolean;
}): EpisodeProductionStatus {
  const { publishingStatus, videoRequired, statuses, workflowComplete = true } = input;
  const profile = input.workflowProfile ?? profileFrom(videoRequired);
  if (publishingStatus === "published") return "Published";
  if (publishingStatus === "scheduled") return "Scheduled";
  if (!workflowComplete) return "Setup incomplete";

  if (profile.kind === "video_series" && profile.videoProductionMode === "original") {
    if (statuses.concept_outline === "todo") return "Not started";
    if (!done(statuses, "concept_outline")) return "Developing concept";
    if (statuses.write_script === "todo") return "Ready to write script";
    if (!done(statuses, "write_script")) return "Writing script";
    if (statuses.approve_script === "todo") return "Ready for script review";
    if (!done(statuses, "approve_script")) return "Reviewing script";
  } else {
    if (statuses.translate_script === "todo") return "Not started";
    if (!done(statuses, "translate_script")) return "Translating";
    if (statuses.approve_translation === "todo") return "Ready for translation review";
    if (!done(statuses, "approve_translation")) return "Reviewing translation";
  }

  if (profile.kind === "video_series") {
    if (["in_progress", "review"].includes(statuses.produce_video ?? "")) {
      return "Producing video";
    }
    if (statuses.produce_video === "todo") return "Ready for video production";
    if (["in_progress", "review"].includes(statuses.approve_video ?? "")) {
      return "Reviewing video";
    }
    if (statuses.approve_video === "todo") return "Ready for video review";
    return "Ready to schedule";
  }

  const videoStarted = videoRequired
    ? VIDEO_STAGES.some((stage) => started(statuses, stage))
    : false;
  const audioReady = done(statuses, "master_audio");
  const videoReady = !videoRequired || done(statuses, "approve_video");
  const audioRecordingActive = ["in_progress", "review"].includes(
    statuses.record_audio ?? ""
  );
  const audioPostActive = ["in_progress", "review"].includes(
    statuses.master_audio ?? ""
  );
  const videoProductionActive = ["in_progress", "review"].includes(
    statuses.produce_video ?? ""
  );
  const videoReviewActive = ["in_progress", "review"].includes(
    statuses.approve_video ?? ""
  );
  const audioPostReady =
    done(statuses, "record_audio") && statuses.master_audio === "todo";
  const videoReviewReady =
    videoRequired &&
    done(statuses, "produce_video") &&
    statuses.approve_video === "todo";

  if (audioReady && videoReady) return "Ready to schedule";
  if (audioReady && !videoStarted) return "Ready for video production";
  if (audioPostActive) return "Mastering audio";
  if (audioRecordingActive) return "Recording audio";
  if (videoRequired && videoReviewActive) return "Reviewing video";
  if (videoRequired && videoProductionActive) return "Producing video";
  if (audioPostReady) return "Ready for audio mastering";
  if (videoReviewReady) return "Ready for video review";
  if (audioReady) return "Ready for video production";
  return "Ready to record";
}

export function trackProgress(
  statuses: StatusByStage,
  stages: PodcastStage[]
): { complete: number; total: number; percent: number } {
  const complete = stages.filter((stage) => done(statuses, stage)).length;
  return {
    complete,
    total: stages.length,
    percent: stages.length === 0 ? 100 : Math.round((complete / stages.length) * 100),
  };
}

export type StageScheduleInput = {
  stage: PodcastStage;
  status: PodcastTaskStatus;
  currentDueDate: string | null;
  dueDateIsManual: boolean;
};

function subtractUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Dates to update when a target publication date changes. */
export function calculateBackwardStageDates(
  targetPublicationDate: string | null,
  offsets: Partial<Record<PodcastStage, number>>,
  tasks: StageScheduleInput[]
): Partial<Record<PodcastStage, string>> {
  if (!targetPublicationDate) return {};
  const updates: Partial<Record<PodcastStage, string>> = {};
  for (const task of tasks) {
    if (task.status === "done" || task.dueDateIsManual) continue;
    const days =
      offsets[task.stage] ??
      PODCAST_STAGE_META[task.stage].defaultDaysBeforePublication;
    updates[task.stage] = subtractUtcDays(targetPublicationDate, Math.max(0, days));
  }
  return updates;
}

/** Keep backward-planned deadlines in the same order as the production chain. */
export function stageOffsetsFollowSequence(
  offsets: Partial<Record<PodcastStage, number>>,
  profile: boolean | EpisodicWorkflowProfile = true
): boolean {
  const stages = requiredStages(profile);
  return stages.every((stage, index) => {
    const nextStage = stages[index + 1];
    if (!nextStage) return true;
    const current =
      offsets[stage] ?? PODCAST_STAGE_META[stage].defaultDaysBeforePublication;
    const next =
      offsets[nextStage] ??
      PODCAST_STAGE_META[nextStage].defaultDaysBeforePublication;
    return current >= next;
  });
}

/** Standard dependency edges. Video stages are omitted when video is skipped. */
export function stageDependencies(profileInput: boolean | EpisodicWorkflowProfile): Array<{
  stage: PodcastStage;
  dependsOn: PodcastStage;
}> {
  const stages = requiredStages(profileInput);
  return stages.slice(1).map((stage, index) => ({
    stage,
    dependsOn: stages[index],
  }));
}

export function requiredStages(
  profileInput: boolean | EpisodicWorkflowProfile
): PodcastStage[] {
  const profile = profileFrom(profileInput);
  if (profile.kind === "video_series") {
    const editorial =
      profile.videoProductionMode === "translation"
        ? TRANSLATION_STAGES
        : ORIGINAL_VIDEO_EDITORIAL_STAGES;
    return [...editorial, ...VIDEO_STAGES, "schedule_episode"];
  }
  const podcast = [
    ...TRANSLATION_STAGES,
    ...AUDIO_STAGES,
    ...(profile.videoRequired ? VIDEO_STAGES : []),
    "schedule_episode" as const,
  ];
  return podcast;
}

/**
 * Expand a manager-facing production state into authoritative task statuses.
 * Every required stage is included so moving backward deliberately resets
 * later work instead of leaving a contradictory rollup.
 */
export function productionStatusTaskPreset(
  target: BulkProductionStatus,
  profileInput: boolean | EpisodicWorkflowProfile
): Partial<Record<PodcastStage, PodcastTaskStatus>> | null {
  const profile = profileFrom(profileInput);
  const stages = requiredStages(profile);
  if (
    profile.kind === "video_series" &&
    [
      "Ready to record",
      "Recording audio",
      "Ready for audio mastering",
      "Mastering audio",
    ].includes(target)
  ) {
    return null;
  }
  if (
    profile.kind === "video_series" &&
    profile.videoProductionMode === "original" &&
    ["Translating", "Ready for translation review", "Reviewing translation"].includes(
      target
    )
  ) {
    return null;
  }
  if (
    !profile.videoRequired &&
    [
      "Ready for video production",
      "Producing video",
      "Ready for video review",
      "Reviewing video",
    ].includes(target)
  ) {
    return null;
  }

  const preset = Object.fromEntries(
    stages.map((stage) => [stage, "todo"])
  ) as Partial<Record<PodcastStage, PodcastTaskStatus>>;
  const complete = (...stages: PodcastStage[]) => {
    for (const stage of stages) {
      if (stage in preset) preset[stage] = "done";
    }
  };
  const start = (stage: PodcastStage) => {
    if (stage in preset) preset[stage] = "in_progress";
  };

  if (target === "Not started") return preset;
  if (target === "Developing concept") {
    start("concept_outline");
    return "concept_outline" in preset ? preset : null;
  }
  if (target === "Ready to write script") {
    complete("concept_outline");
    return "write_script" in preset ? preset : null;
  }
  if (target === "Writing script") {
    complete("concept_outline");
    start("write_script");
    return "write_script" in preset ? preset : null;
  }
  if (target === "Ready for script review") {
    complete("concept_outline", "write_script");
    return "approve_script" in preset ? preset : null;
  }
  if (target === "Reviewing script") {
    complete("concept_outline", "write_script");
    start("approve_script");
    return "approve_script" in preset ? preset : null;
  }
  if (target === "Translating") {
    start("translate_script");
    return preset;
  }

  complete("translate_script");
  if (target === "Ready for translation review") return preset;
  if (target === "Reviewing translation") {
    start("approve_translation");
    return preset;
  }

  complete("approve_translation");
  if (target === "Ready to record") return preset;
  if (target === "Recording audio") {
    start("record_audio");
    return preset;
  }
  if (target === "Ready for audio mastering") {
    complete("record_audio");
    return preset;
  }
  if (target === "Mastering audio") {
    complete("record_audio");
    start("master_audio");
    return preset;
  }
  if (target === "Ready for video production") {
    complete(...stages.slice(0, stages.indexOf("produce_video")));
    return preset;
  }
  if (target === "Producing video") {
    complete(...stages.slice(0, stages.indexOf("produce_video")));
    start("produce_video");
    return preset;
  }
  if (target === "Ready for video review") {
    complete(...stages.slice(0, stages.indexOf("approve_video")));
    return preset;
  }
  if (target === "Reviewing video") {
    complete(...stages.slice(0, stages.indexOf("approve_video")));
    start("approve_video");
    return preset;
  }

  complete(...stages.filter((stage) => stage !== "schedule_episode"));
  return preset;
}
