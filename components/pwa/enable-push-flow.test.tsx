import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setup: vi.fn(), install: vi.fn() }));
vi.mock("@/hooks/use-push-setup", () => ({ usePushSetup: mocks.setup }));
vi.mock("@/components/pwa/pwa-provider", () => ({ usePwaInstall: mocks.install }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { EnablePushFlow } from "./enable-push-flow";

beforeEach(() => {
  mocks.setup.mockReturnValue({ state: "ready", ios: false, standalone: false, macSafari: true, busy: false, error: null, refresh: vi.fn() });
  mocks.install.mockReturnValue({ macSafari: true, installed: false, canInstall: false });
});

describe("installation and notification setup", () => {
  it.each(["ready", "enabled", "denied", "unsupported"])("keeps Mac installation available when push is %s", (state) => {
    mocks.setup.mockReturnValue({ ...mocks.setup(), state });
    const html = renderToStaticMarkup(<EnablePushFlow />);
    expect(html).toContain("Add to Dock");
    expect(html).not.toContain("Install app");
  });

  it("keeps Chromium installation available after notifications are enabled", () => {
    mocks.setup.mockReturnValue({ ...mocks.setup(), state: "enabled", macSafari: false });
    mocks.install.mockReturnValue({ macSafari: false, installed: false, canInstall: true });
    expect(renderToStaticMarkup(<EnablePushFlow />)).toContain("Install app");
  });

  it("hides installation when already running as an app", () => {
    mocks.install.mockReturnValue({ macSafari: true, installed: true, canInstall: false });
    expect(renderToStaticMarkup(<EnablePushFlow />)).not.toContain("Add to Dock");
  });

  it("gives Safari website settings for a blocked browser tab", () => {
    mocks.setup.mockReturnValue({ ...mocks.setup(), state: "denied" });
    const html = renderToStaticMarkup(<EnablePushFlow />);
    expect(html).toContain("Websites");
    expect(html).toContain("Focus");
    expect(html).not.toContain("Permissions");
  });

  it("gives macOS app settings for a blocked Dock app", () => {
    mocks.setup.mockReturnValue({ ...mocks.setup(), state: "denied", standalone: true });
    mocks.install.mockReturnValue({ macSafari: true, installed: true, canInstall: false });
    const html = renderToStaticMarkup(<EnablePushFlow />);
    expect(html).toContain("Allow notifications");
    expect(html).not.toContain("Websites");
    expect(html).not.toContain("Add to Dock");
  });

  it("preserves the iPhone/iPad install flow", () => {
    mocks.setup.mockReturnValue({ ...mocks.setup(), state: "ios-needs-install", ios: true, macSafari: false });
    mocks.install.mockReturnValue({ macSafari: false, installed: false, canInstall: false });
    const html = renderToStaticMarkup(<EnablePushFlow />);
    expect(html).toContain("Add to Home Screen");
    expect(html).not.toContain("Add to Dock");
  });
});
