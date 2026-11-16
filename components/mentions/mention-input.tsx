"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Users } from "lucide-react";

import { getMentionTargets } from "@/lib/mentions/actions";
import { mentionMenuPosition } from "@/lib/mentions/menu-position";
import type { MentionTarget } from "@/lib/mentions/roster";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 8;
const BOUNDARY_BEFORE = /[\s.,;:!?()[\]{}<>"'`~/\\|@#]/;

type ActiveQuery = { start: number; query: string };
type MentionOption = { kind: "person"; member: MentionTarget } | { kind: "channel" };

/**
 * Find the mention the caret is currently editing: an `@` at a word boundary
 * with only non-whitespace after it up to the caret. Returns null when the
 * caret isn't inside a fresh `@token`.
 */
function detectActiveQuery(value: string, caret: number): ActiveQuery | null {
  let i = caret - 1;
  // A mention query is limited to 40 characters. Pasted URLs and long words
  // must not scan the whole draft on both input and keyup.
  const earliest = Math.max(0, caret - 41);
  while (i >= earliest) {
    const ch = value[i];
    if (ch === "@") {
      const before = value[i - 1];
      if (i > 0 && !BOUNDARY_BEFORE.test(before ?? "")) return null;
      const query = value.slice(i + 1, caret);
      if (query.length > 40) return null;
      return { start: i, query };
    }
    if (/\s/.test(ch ?? "")) return null;
    i -= 1;
  }
  return null;
}

function rankMembers(members: MentionTarget[], query: string): MentionTarget[] {
  const q = query.toLowerCase();
  if (!q) return members.slice(0, MAX_RESULTS);
  const scored: { member: MentionTarget; score: number; at: number }[] = [];
  for (const member of members) {
    const name = member.name.toLowerCase();
    const local = (member.email ?? "").split("@")[0]?.toLowerCase() ?? "";
    const nameAt = name.indexOf(q);
    const localAt = local.indexOf(q);
    if (nameAt === -1 && localAt === -1) continue;
    let score = 3;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (nameAt !== -1) score = 2;
    scored.push({ member, score, at: nameAt === -1 ? localAt : nameAt });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.at - b.at ||
      a.member.name.localeCompare(b.member.name)
  );
  return scored.slice(0, MAX_RESULTS).map((s) => s.member);
}

type MenuPosition = ReturnType<typeof mentionMenuPosition>;

export type MentionInputProps = Omit<
  React.ComponentProps<"textarea">,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Preloaded roster; when omitted it's fetched lazily on first `@`. */
  members?: MentionTarget[];
  /** Chat-only option; never added to the personal mention roster. */
  channelMentions?: boolean;
  /** Scope the lazily-fetched roster to a project's team. */
  scope?: { projectId?: string | null };
  /** Class for the relative wrapper (carry layout like `flex-1` here). */
  containerClassName?: string;
};

/**
 * A textarea with `@`-triggered mention autocomplete. Drop-in for the app
 * `Textarea`: it keeps the same look and forwards `onKeyDown` (so a parent's
 * Enter-to-send still works) except while the mention menu is open, when the
 * arrow keys / Enter / Escape drive the menu instead.
 */
export function MentionInput({
  value,
  onChange,
  members: providedMembers,
  channelMentions = false,
  scope,
  containerClassName,
  className,
  onKeyDown,
  onBlur,
  disabled,
  ...textareaProps
}: MentionInputProps) {
  const menuId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [fetched, setFetched] = useState<MentionTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const loadStartedRef = useRef(false);
  const insertingRef = useRef(false);

  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  // An explicit empty roster is a closed scope, not permission to fetch everyone.
  const providedRoster = providedMembers ?? null;
  const members = providedRoster ?? fetched;

  const loadMembers = useCallback(() => {
    if (providedRoster || loadStartedRef.current) return;
    loadStartedRef.current = true;
    setLoading(true);
    getMentionTargets(scope)
      .then((people) => setFetched(people))
      .catch(() => setFetched([]))
      .finally(() => setLoading(false));
  }, [providedRoster, scope]);

  // `active` becomes stale if the value is cleared from the outside (e.g. after
  // posting): guard on the `@` still living at the recorded offset so the menu
  // closes without a setState-in-effect.
  const open =
    active !== null &&
    value[active.start] === "@" &&
    active.start !== dismissedStart;

  const results = useMemo<MentionOption[]>(() => {
    if (!open || !active) return [];
    const people: MentionOption[] = rankMembers(members ?? [], active.query)
      .map(member => ({ kind: "person", member }));
    // Keep people first for an empty query to avoid accidental broad alerts.
    if (channelMentions && "channel".startsWith(active.query.toLowerCase())) {
      people.push({ kind: "channel" });
    }
    return people;
  }, [open, active, members, channelMentions]);

  const updatePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewport = window.visualViewport;
    setMenuPos(mentionMenuPosition(rect, {
      offsetLeft: viewport?.offsetLeft ?? 0,
      offsetTop: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    }));
  }, []);

  // Keep the menu pinned to the textarea while scrolling/resizing.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const viewport = window.visualViewport;
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    viewport?.addEventListener("resize", handler);
    viewport?.addEventListener("scroll", handler);
    const observer = new ResizeObserver(handler);
    if (ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      viewport?.removeEventListener("resize", handler);
      viewport?.removeEventListener("scroll", handler);
      observer.disconnect();
    };
  }, [open, updatePosition]);

  // Keep the highlight in range if the result list shrank as the query narrowed.
  const highlighted = activeIndex < results.length ? activeIndex : 0;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const found = detectActiveQuery(value, el.selectionStart ?? value.length);
    setActive(found);
    if (found) loadMembers();
    if (!found) setDismissedStart(null);
  }, [value, loadMembers]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    onChange(next);
    if (insertingRef.current) return;
    const found = detectActiveQuery(next, event.target.selectionStart ?? next.length);
    setActive(found);
    setActiveIndex(0);
    if (found) {
      loadMembers();
      if (found.start !== dismissedStart) setDismissedStart(null);
    } else {
      setDismissedStart(null);
    }
  };

  const insertMention = (option: MentionOption) => {
    const el = ref.current;
    if (!el || !active) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, active.start);
    const after = value.slice(caret);
    const token = `@${option.kind === "channel" ? "channel" : option.member.name} `;
    const nextValue = before + token + after;
    const nextCaret = before.length + token.length;

    insertingRef.current = true;
    onChange(nextValue);
    setActive(null);
    setDismissedStart(null);
    requestAnimationFrame(() => {
      const node = ref.current;
      if (node) {
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
      }
      insertingRef.current = false;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (open && results.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(results[highlighted] ?? results[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedStart(active?.start ?? null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const menu =
    open && active && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            id={menuId}
            role="listbox"
            aria-label="Mention suggestions"
            className={cn(
              "fixed z-50 overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
              "animate-in fade-in-0 zoom-in-95 duration-100 motion-reduce:animate-none"
            )}
            style={{
              left: menuPos.left,
              top: menuPos.top,
              translate: menuPos.flip ? "0 -100%" : undefined,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
            // Keep focus (and the software keyboard) in the composer while a
            // touch chooses a name. Native scrolling of the list still works.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && results.length === 0 ? (
              <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading people…
              </p>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">
                No people match “{active.query}”
              </p>
            ) : (
              <ul className="flex flex-col">
                {results.map((option, index) => (
                  <li key={option.kind === "channel" ? "channel" : option.member.id}>
                    <button
                      id={`${menuId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      data-active={index === highlighted}
                      ref={
                        index === highlighted
                          ? (el) => el?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => insertMention(option)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        index === highlighted
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/60"
                      )}
                    >
                      {option.kind === "channel" ? (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Users aria-hidden className="size-4" />
                        </span>
                      ) : <UserAvatar
                        name={option.member.name}
                        image={option.member.image}
                        size="sm"
                        className="size-7 shrink-0"
                      />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium leading-tight">
                          {option.kind === "channel" ? "@channel" : option.member.name}
                        </span>
                        <span className={cn("block text-xs text-muted-foreground", option.kind === "channel" ? "text-wrap leading-snug" : "truncate")}>
                          {option.kind === "channel" ? "Notify everyone in this channel" : option.member.email}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("relative", containerClassName)}>
      <Textarea
        {...textareaProps}
        ref={ref}
        value={value}
        disabled={disabled}
        className={className}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={sync}
        onClick={sync}
        onBlur={(e) => {
          // Delay so a menu click (mousedown) can land before we close.
          setTimeout(() => setActive(null), 100);
          onBlur?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={open && results.length > 0 ? `${menuId}-${highlighted}` : undefined}
      />
      {menu}
    </div>
  );
}
