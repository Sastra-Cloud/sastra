import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageReactions } from "./message-reactions";
import type { ChatReaction } from "@/lib/chat/queries";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (next: unknown) => { hooks.values[i] = next; }];
  },
  useRef(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = { current: initial };
    return hooks.values[i];
  },
}));
function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return isValidElement<Record<string, unknown>>(node) ? [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements), ...elements(node.props.render as ReactNode)] : [];
}
const react = vi.fn();
const reactions: ChatReaction[] = [
  { emoji: "👍", count: 4, mine: true }, { emoji: "❤️", count: 3, mine: false },
  { emoji: "🙏", count: 2, mine: false }, { emoji: "👀", count: 1, mine: true },
];
function render(items = reactions, pending = false) {
  hooks.cursor = 0;
  const tree = MessageReactions({ reactions: items, isOwn: true, pending, onReact: react });
  const all = elements(tree);
  return { root: tree.props, all, button: (label: string) => all.find(e => String(e.props["aria-label"]).startsWith(label))!.props };
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; vi.clearAllMocks(); });
describe("message reaction disclosure", () => {
  it("opens one summary without changing a reaction and reveals the full breakdown", () => {
    expect(render().button("View 10 reactions")["aria-label"]).toContain("including yours");
    expect(render().all.filter(e => "aria-pressed" in e.props)).toHaveLength(0);
    (render().root.onOpenChange as (open: boolean) => void)(true);
    expect(react).not.toHaveBeenCalled();
    expect(render().all.filter(e => "aria-pressed" in e.props)).toHaveLength(4);
    expect(render().button("Remove your 👍")["aria-pressed"]).toBe(true);
    expect(render().button("Add your ❤️")["aria-pressed"]).toBe(false);
  });
  it("changes only the selected reaction and prevents writes while pending", () => {
    (render().root.onOpenChange as (open: boolean) => void)(true);
    (render().button("Add your ❤️").onClick as () => void)();
    expect(react).toHaveBeenCalledExactlyOnceWith("❤️");
    expect(render(reactions, true).button("Add your ❤️").disabled).toBe(true);
    (render(reactions, true).button("Add your ❤️").onClick as () => void)();
    expect(react).toHaveBeenCalledTimes(1);
    expect(render(reactions, true).button("View 10 reactions").disabled).toBeUndefined();
  });
  it("keeps the details open when the last reaction is removed", () => {
    (render().root.onOpenChange as (open: boolean) => void)(true);
    const empty = render([]);
    expect(empty.root.open).toBe(true);
    expect(empty.all.some(e => e.props.role === "status" && e.props.children === "No reactions yet.")).toBe(true);
    expect(empty.all.some(e => String(e.props["aria-label"]).startsWith("View "))).toBe(false);
  });
});
