import type { StoredToolCall } from "./types";

export type LearningTranscriptMessage = {
  id: string;
  userId: string;
  role: string;
  content: string | null;
  toolCalls: StoredToolCall[] | null;
};

const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\binstead\b/i,
  /\bnever\s?mind\b/i,
  /\bthat(?:'s| is) not\b/i,
  /\bnot what i (?:asked|meant|wanted|said)\b/i,
  /\bi (?:wasn(?:'t|’t)|was not) asking\b/i,
  /\bi was saying\b/i,
  /\bi (?:didn(?:'t|’t)|did not) ask\b/i,
  /\bi meant\b/i,
  /\bno,? i\b/i,
  /\byou (?:don(?:'t|’t)|do not) need to\b/i,
  /\bplease (?:don(?:'t|’t)|do not)\b/i,
  /\bstop (?:doing|showing|including|asking)\b/i,
];

const DIRECT_TASK_PATTERN =
  /\b(?:add|create|make|set up)\b[^.!?\n]{0,80}\btask\b|\btask\b[^.!?\n]{0,40}\b(?:for me|to)\b/i;

const ID_REQUEST_PATTERN =
  /\b(?:id|ids|identifier|identifiers|uuid|uuids)\b/i;

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const DURABLE_ASSISTANT_PREFERENCE_PATTERNS = [
  /\bfrom now on\b/i,
  /\byou (?:don(?:'t|’t)|do not) need to (?:show|tell|include|mention|explain|ask)\b/i,
  /\b(?:don(?:'t|’t)|do not) (?:show|include|mention)\b[^.!?\n]{0,100}\b(?:to me|in (?:replies|responses|confirmations))\b/i,
  /\balways\b[^.!?\n]{0,100}\b(?:reply|respond|confirm|ask|show|include|mention)\b/i,
  /\bnever\b[^.!?\n]{0,100}\b(?:reply|respond|confirm|ask|show|include|mention)\b/i,
];

export function isLikelyUserCorrection(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 4_000) return false;
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(clean));
}

export function isDirectTaskRequest(text: string): boolean {
  return DIRECT_TASK_PATTERN.test(text);
}

export function userRequestedInternalIds(text: string): boolean {
  return ID_REQUEST_PATTERN.test(text);
}

export function containsInternalUuid(text: string): boolean {
  return UUID_PATTERN.test(text);
}

export function isDurableAssistantPreference(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 500) return false;
  return DURABLE_ASSISTANT_PREFERENCE_PATTERNS.some((pattern) => pattern.test(clean));
}

export function toolNames(messages: LearningTranscriptMessage[]): string[] {
  return messages.flatMap((message) =>
    (message.toolCalls ?? []).map((call) => call.function.name)
  );
}

export function analyzeAssistantTurn(
  userText: string,
  assistantMessages: LearningTranscriptMessage[]
): {
  directTaskWithoutCreate: boolean;
  internalIdDisclosure: boolean;
} {
  const usedTools = toolNames(assistantMessages);
  return {
    directTaskWithoutCreate:
      isDirectTaskRequest(userText) && !usedTools.includes("create_task"),
    internalIdDisclosure:
      !userRequestedInternalIds(userText) &&
      assistantMessages.some(
        (message) => !!message.content && containsInternalUuid(message.content)
      ),
  };
}

export function groupTranscriptByUser(
  messages: LearningTranscriptMessage[]
): Map<string, LearningTranscriptMessage[]> {
  const grouped = new Map<string, LearningTranscriptMessage[]>();
  for (const message of messages) {
    const rows = grouped.get(message.userId) ?? [];
    rows.push(message);
    grouped.set(message.userId, rows);
  }
  return grouped;
}
