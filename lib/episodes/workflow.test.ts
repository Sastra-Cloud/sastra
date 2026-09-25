import { describe, expect, it } from "vitest";

import {
  BULK_PRODUCTION_STATUSES,
  calculateBackwardStageDates,
  deriveEpisodeProductionStatus,
  PODCAST_STAGE_META,
  productionStatusTaskPreset,
  stageDependencies,
  stageOffsetsFollowSequence,
  type PodcastStage,
  type PodcastTaskStatus,
  workflowProfile,
  requiredStages,
  ORIGINAL_VIDEO_PRODUCTION_STATUSES,
} from "./workflow";

const statuses = (
  values: Partial<Record<PodcastStage, PodcastTaskStatus>>
) => values;

describe("podcast episode production status", () => {
  it.each([
    ["published", {}, true, "Published"],
    ["scheduled", {}, true, "Scheduled"],
    ["draft", { translate_script: "todo" }, true, "Not started"],
    ["draft", { translate_script: "in_progress" }, true, "Translating"],
    [
      "draft",
      { translate_script: "done", approve_translation: "todo" },
      true,
      "Ready for translation review",
    ],
    [
      "draft",
      { translate_script: "done", approve_translation: "in_progress" },
      true,
      "Reviewing translation",
    ],
    [
      "draft",
      { translate_script: "done", approve_translation: "done" },
      true,
      "Ready to record",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "in_progress",
      },
      true,
      "Recording audio",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "done",
        master_audio: "in_progress",
      },
      true,
      "Mastering audio",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "done",
        master_audio: "todo",
      },
      true,
      "Ready for audio mastering",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        master_audio: "done",
      },
      true,
      "Ready for video production",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "done",
        master_audio: "done",
        produce_video: "in_progress",
      },
      true,
      "Producing video",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "done",
        master_audio: "done",
        produce_video: "done",
        approve_video: "review",
      },
      true,
      "Reviewing video",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        record_audio: "done",
        master_audio: "done",
        produce_video: "done",
        approve_video: "todo",
      },
      true,
      "Ready for video review",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        master_audio: "done",
        approve_video: "done",
      },
      true,
      "Ready to schedule",
    ],
    [
      "draft",
      {
        translate_script: "done",
        approve_translation: "done",
        master_audio: "done",
      },
      false,
      "Ready to schedule",
    ],
  ] as const)("derives %s episodes as %s", (publishingStatus, taskStatuses, videoRequired, expected) => {
    expect(
      deriveEpisodeProductionStatus({
        publishingStatus,
        videoRequired,
        statuses: statuses(taskStatuses),
      })
    ).toBe(expected);
  });

  it("reports incomplete setup instead of pretending missing tasks are progress", () => {
    expect(
      deriveEpisodeProductionStatus({
        publishingStatus: "draft",
        videoRequired: true,
        statuses: {},
        workflowComplete: false,
      })
    ).toBe("Setup incomplete");
  });
});

describe("backward podcast scheduling", () => {
  it("calculates dates in UTC and preserves completed and manual dates", () => {
    expect(
      calculateBackwardStageDates(
        "2026-08-20",
        { translate_script: 30, approve_translation: 20, record_audio: 10 },
        [
          {
            stage: "translate_script",
            status: "todo",
            currentDueDate: null,
            dueDateIsManual: false,
          },
          {
            stage: "approve_translation",
            status: "done",
            currentDueDate: "2026-07-01",
            dueDateIsManual: false,
          },
          {
            stage: "record_audio",
            status: "todo",
            currentDueDate: "2026-08-01",
            dueDateIsManual: true,
          },
        ]
      )
    ).toEqual({ translate_script: "2026-07-21" });
  });

  it("does not change dates when there is no publication target", () => {
    expect(
      calculateBackwardStageDates(null, {}, [
        {
          stage: "translate_script",
          status: "todo",
          currentDueDate: null,
          dueDateIsManual: false,
        },
      ])
    ).toEqual({});
  });

  it("requires deadline offsets to follow the production sequence", () => {
    expect(
      stageOffsetsFollowSequence({ master_audio: 21, produce_video: 14 })
    ).toBe(true);
    expect(
      stageOffsetsFollowSequence({ master_audio: 7, produce_video: 14 })
    ).toBe(false);
  });
});

describe("bulk production status presets", () => {
  it.each(BULK_PRODUCTION_STATUSES)(
    "round-trips %s through authoritative task statuses",
    (target) => {
      const preset = productionStatusTaskPreset(target, true);
      expect(preset).not.toBeNull();
      expect(
        deriveEpisodeProductionStatus({
          publishingStatus: "draft",
          videoRequired: true,
          statuses: preset ?? {},
          workflowComplete: true,
        })
      ).toBe(target);
    }
  );

  it("rejects video presets when video is not required", () => {
    expect(productionStatusTaskPreset("Producing video", false)).toBeNull();
  });

  it("makes optional-video episodes ready without video tasks", () => {
    const preset = productionStatusTaskPreset("Ready to schedule", false);
    expect(preset?.produce_video).toBeUndefined();
    expect(
      deriveEpisodeProductionStatus({
        publishingStatus: "draft",
        videoRequired: false,
        statuses: preset ?? {},
      })
    ).toBe("Ready to schedule");
  });
});

describe("sequential podcast dependencies", () => {
  it("starts video only after the audio master and schedules after video review", () => {
    expect(stageDependencies(true)).toEqual([
      { stage: "approve_translation", dependsOn: "translate_script" },
      { stage: "record_audio", dependsOn: "approve_translation" },
      { stage: "master_audio", dependsOn: "record_audio" },
      { stage: "produce_video", dependsOn: "master_audio" },
      { stage: "approve_video", dependsOn: "produce_video" },
      { stage: "schedule_episode", dependsOn: "approve_video" },
    ]);
  });

  it("schedules directly after audio when video is skipped", () => {
    expect(stageDependencies(false).at(-1)).toEqual({
      stage: "schedule_episode",
      dependsOn: "master_audio",
    });
  });

  it("orders automatic deadlines in the same sequence", () => {
    expect(PODCAST_STAGE_META.master_audio.defaultDaysBeforePublication).toBeGreaterThan(
      PODCAST_STAGE_META.produce_video.defaultDaysBeforePublication
    );
  });
});

describe("video-series workflow profiles", () => {
  it("uses editorial scripting without standalone audio for original video", () => {
    const profile = workflowProfile({
      kind: "video_series",
      videoProductionMode: "original",
    });
    expect(requiredStages(profile)).toEqual([
      "concept_outline",
      "write_script",
      "approve_script",
      "produce_video",
      "approve_video",
      "schedule_episode",
    ]);
    expect(stageDependencies(profile)).toContainEqual({
      stage: "produce_video",
      dependsOn: "approve_script",
    });
  });

  it.each([
    "Not started",
    ...ORIGINAL_VIDEO_PRODUCTION_STATUSES,
    "Ready for video production",
    "Producing video",
    "Ready for video review",
    "Reviewing video",
    "Ready to schedule",
  ] as const)("round-trips original video status %s", (target) => {
    const profile = workflowProfile({
      kind: "video_series",
      videoProductionMode: "original",
    });
    const preset = productionStatusTaskPreset(target, profile);
    expect(preset).not.toBeNull();
    expect(
      deriveEpisodeProductionStatus({
        publishingStatus: "draft",
        videoRequired: true,
        workflowProfile: profile,
        statuses: preset ?? {},
      })
    ).toBe(target);
  });

  it("uses translation approval without standalone audio for translated video", () => {
    const profile = workflowProfile({
      kind: "video_series",
      videoProductionMode: "translation",
    });
    expect(requiredStages(profile)).toEqual([
      "translate_script",
      "approve_translation",
      "produce_video",
      "approve_video",
      "schedule_episode",
    ]);
  });
});
