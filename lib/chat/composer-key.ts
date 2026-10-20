"use client";

import type { KeyboardEvent } from "react";
import { shouldSendConversationKey } from "@/lib/chat/conversation";

export function sendOnConversationKey(event: KeyboardEvent<HTMLTextAreaElement>, send: () => void) {
  if (event.defaultPrevented) return;
  if (shouldSendConversationKey({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    isComposing: event.nativeEvent.isComposing,
    keyCode: event.nativeEvent.keyCode,
  }, window.matchMedia("(pointer: coarse)").matches)) {
    event.preventDefault();
    send();
  }
}
