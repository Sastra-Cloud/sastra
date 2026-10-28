import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MessageActions } from "./message-actions";
import { messageHoldHaptic } from "@/lib/chat/haptics";
import type { ChatMessageView } from "@/lib/chat/queries";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, hold: undefined as (() => void) | undefined }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(), useEffect: vi.fn(), useLayoutEffect: vi.fn(),
  useCallback: (callback: unknown) => callback,
  useState(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === "function" ? next(hooks.values[i]) : next; }];
  },
  useRef(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = { current: initial };
    return hooks.values[i];
  },
}));
vi.mock("./use-message-hold", () => ({ useMessageHold: (_enabled: boolean, onHold: () => void) => { hooks.hold = onHold; return { onContextMenu: vi.fn() }; }, MESSAGE_NATIVE_CONTROLS: "a,button,input,audio,video" }));
vi.mock("@/lib/chat/haptics", () => ({ messageHoldHaptic: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const react = vi.fn();
const edit = vi.fn();
const reply = vi.fn();
function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return isValidElement<Record<string, unknown>>(node) ? [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)] : [];
}
function render() {
  hooks.cursor = 0;
  const all = elements(MessageActions({ m: { id: "saved", status: "sent", content: "Hello @Teammate", authorName: "Sender", reactions: [{ emoji: "👍", count: 1, mine: true }] } as ChatMessageView,
    isOwn: true, pin: false, time: "12:00", reactionPending: false, pinPending: false, onEdit: edit, onReply: reply, onReact: react, onTogglePin: vi.fn(), onDelete: vi.fn(), children: "Message" }));
  return {
    popover: all.find(e => "open" in e.props)!.props,
    surface: all.find(e => "data-message-press-surface" in e.props)!.props,
    menu: all.find(e => e.props["aria-label"] === "Message actions")!.props,
    button: (label: string) => all.find(e => typeof e.props.onClick === "function" && (e.props["aria-label"] === label || e.props.children && Children.toArray(e.props.children as ReactNode).includes(label)))!.props,
  };
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; vi.clearAllMocks(); });
describe("message actions", () => {
  it("hands off focus when opening the editor or reply composer", () => {
    (render().popover.onOpenChange as (open: boolean) => void)(true);
    (render().button("Edit message").onClick as () => void)();
    expect(edit).toHaveBeenCalledOnce();
    expect(render().popover.open).toBe(false);
    expect((render().menu.finalFocus as () => unknown)()).toBe(false);
    hooks.hold!();
    expect((render().menu.finalFocus as () => unknown)()).not.toBe(false);
    const composer = { focus: vi.fn() };
    (render().surface.ref as { current: unknown }).current = {
      closest: () => ({ querySelector: () => composer }),
    };
    (render().button("Reply").onClick as () => void)();
    expect(reply).toHaveBeenCalledOnce();
    expect(render().popover.open).toBe(false);
    expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect((render().menu.finalFocus as () => unknown)()).toBe(composer);
  });
  it("gives haptic feedback only when a touch hold opens the menu", () => {
    render();
    expect(messageHoldHaptic).not.toHaveBeenCalled();
    (render().popover.onOpenChange as (open: boolean) => void)(true);
    expect(messageHoldHaptic).not.toHaveBeenCalled();
    (render().popover.onOpenChange as (open: boolean) => void)(false);
    hooks.hold!();
    expect(render().popover.open).toBe(true);
    expect(messageHoldHaptic).toHaveBeenCalledOnce();
  });
  it("opens on selected or unselected bubble text while preserving native link menus", () => {
    vi.stubGlobal("window", { getSelection: () => null });
    const event = { target: { closest: () => null }, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const context = () => render().surface.onContextMenu as (event: unknown) => void;
    context()({ ...event, target: { closest: () => ({}) } });
    expect(render().popover.open).toBe(false);
    vi.stubGlobal("window", { getSelection: () => ({ isCollapsed: false, containsNode: () => true }) });
    context()(event);
    expect(render().popover.open).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    (render().popover.onOpenChange as (open: boolean) => void)(false);
    vi.stubGlobal("window", { getSelection: () => null });
    context()(event);
    expect(render().popover.open).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    (render().popover.onOpenChange as (open: boolean) => void)(false);
    (render().surface.onKeyDown as (event: unknown) => void)({ ...event, key: "F10", shiftKey: true });
    expect(render().popover.open).toBe(true);
    expect(messageHoldHaptic).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("quick reply hands focus to the composer", () => {
    const composer = { focus: vi.fn() };
    (render().surface.ref as { current: unknown }).current = {
      closest: () => ({ querySelector: () => composer }),
    };
    (render().button("Reply to message").onClick as () => void)();
    expect(reply).toHaveBeenCalledOnce();
    expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect((render().menu.finalFocus as () => unknown)()).toBe(composer);
  });
  it("highlights your quick reaction and closes after choosing", () => {
    (render().popover.onOpenChange as (open: boolean) => void)(true);
    expect(render().button("React 👍").checked).toBe(true);
    (render().button("React 👍").onClick as () => void)();
    expect(react).toHaveBeenCalledWith("👍");
    expect(render().popover.open).toBe(false);
  });
  it("waits for clipboard success, prevents duplicates, then closes", async () => {
    let finish!: () => void;
    const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    (render().popover.onOpenChange as (open: boolean) => void)(true);
    const copy = render().button("Copy text").onClick as () => Promise<void>;
    const pending = copy(); await copy();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("Hello @Teammate");
    expect(render().button("Copying…").disabled).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
    finish(); await pending;
    expect(toast.success).toHaveBeenCalledWith("Message copied");
    expect(render().popover.open).toBe(false);
    vi.unstubAllGlobals();
  });
  it("keeps the menu open and reports clipboard failure", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    (render().popover.onOpenChange as (open: boolean) => void)(true);
    await (render().button("Copy text").onClick as () => Promise<void>)();
    expect(toast.error).toHaveBeenCalled();
    expect(render().popover.open).toBe(true);
    expect(render().button("Copy text").disabled).toBe(false);
    vi.unstubAllGlobals();
  });
});
