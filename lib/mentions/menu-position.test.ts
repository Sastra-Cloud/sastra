import { describe, expect, it } from "vitest";

import { mentionMenuPosition } from "./menu-position";

describe("mention picker visibility", () => {
  it("opens above the composer when a phone keyboard covers the layout viewport", () => {
    const menu = mentionMenuPosition(
      { left: 98, top: 250, bottom: 360, width: 240 },
      { offsetLeft: 0, offsetTop: 0, width: 390, height: 400 }
    );
    expect(menu.flip).toBe(true);
    expect(menu.top).toBe(244);
    expect(menu.top - menu.maxHeight).toBeGreaterThanOrEqual(8);
    expect(menu.top).toBeLessThan(250);
  });

  it("keeps the picker inside a panned, short visual viewport", () => {
    const viewport = { offsetLeft: 20, offsetTop: 140, width: 320, height: 200 };
    const menu = mentionMenuPosition({ left: 250, top: 400, bottom: 460, width: 240 }, viewport);
    expect(menu.left).toBeGreaterThanOrEqual(viewport.offsetLeft + 8);
    expect(menu.left + menu.width).toBeLessThanOrEqual(viewport.offsetLeft + viewport.width - 8);
    expect(menu.top - menu.maxHeight).toBeGreaterThanOrEqual(viewport.offsetTop + 8);
    expect(menu.top).toBeLessThanOrEqual(viewport.offsetTop + viewport.height - 8);
  });

  it("preserves a downward picker when a desktop comment has room below", () => {
    const menu = mentionMenuPosition(
      { left: 200, top: 100, bottom: 160, width: 400 },
      { offsetLeft: 0, offsetTop: 0, width: 1440, height: 1000 }
    );
    expect(menu).toMatchObject({ flip: false, top: 166, left: 200, width: 400, maxHeight: 256 });
  });
});
