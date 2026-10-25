import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), getImport: vi.fn(), listImports: vi.fn(), workspace: vi.fn(),
  imp: {} as Record<string, unknown>, group: null as { id: string } | null,
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("./file-access", () => ({ getAccessibleExtractionFile: mocks.access }));
vi.mock("./queries", () => ({
  getImport: mocks.getImport, listProjectsForImportMatch: async () => [],
  listImports: mocks.listImports,
  countPendingUpdateImports: async () => 0,
}));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: mocks.workspace }));
vi.mock("@/lib/budget/queries", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not-found"); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/files/file-link", () => ({ FileLink: () => null }));
vi.mock("@/components/cockpit", () => ({
  PageShell: ({ children }: { children: ReactNode }) => children,
  ContentColumn: ({ children }: { children: ReactNode }) => children,
  PageHero: () => null,
}));
// Serialize the client-bound props so the test detects source disclosure even
// when the real client component would choose not to display those fields.
vi.mock("@/components/imports/import-review", () => ({
  ImportReview: (props: unknown) => createElement("pre", null, JSON.stringify(props)),
}));
vi.mock("@/components/agreements/funding-review", () => ({
  FundingReview: (props: unknown) => createElement("pre", null, JSON.stringify(props)),
}));
vi.mock("@/components/imports/retry-import-button", () => ({ RetryImportButton: () => null }));
vi.mock("@/components/imports/import-uploader", () => ({ ImportUploader: () => null }));
vi.mock("@/components/imports/import-list-refresh", () => ({ ImportListRefresh: () => null }));
vi.mock("@/components/imports/discard-import-button", () => ({ DiscardImportButton: () => null }));
vi.mock("@/components/ai/ai-setup-guidance", () => ({ AiSetupGuidance: () => null }));
vi.mock("@/lib/ai/keys", () => ({ getOpenRouterApiKeyStatus: async () => ({ source: "none" }) }));
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return { db: { select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => {
    const rows = getTableName(table) === "document_imports" ? [mocks.imp]
      : getTableName(table) === "shared_mou_groups" && mocks.group ? [mocks.group] : [];
    return {
      where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }),
      orderBy: async () => rows,
    };
  } }) } };
});

import ImportReviewPage from "@/app/(app)/projects/import/[importId]/page";
import FundingReviewPage from "@/app/(app)/agreements/review/[importId]/page";
import ImportPage from "@/app/(app)/projects/import/page";

const params = Promise.resolve({ importId: "import" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "requester" } });
  mocks.access.mockResolvedValue(null);
  mocks.workspace.mockResolvedValue({ timezone: "UTC" });
  mocks.group = null;
  mocks.imp = {
    id: "import", fileId: "private-file", fileName: "Private filename.pdf",
    status: "extracted", error: "Private error", errorKind: "file",
    targetProjectId: null, fundingSourceKey: null, committedProjectIds: [],
    extraction: { documentKind: "agreement", agreementType: "funding",
      documentTitle: "Private title", projects: [], mouPaymentSchedule: [{ amount: 100 }] },
  };
  mocks.getImport.mockImplementation(async () => mocks.imp);
  mocks.listImports.mockResolvedValue([]);
});

describe("import review source authorization", () => {
  it("scopes the recent import list to the authenticated manager", async () => {
    await ImportPage();
    expect(mocks.auth).toHaveBeenCalledWith("manager");
    expect(mocks.listImports).toHaveBeenCalledExactlyOnceWith("requester");
  });

  it("rejects cached project review after source access is removed", async () => {
    await expect(ImportReviewPage({ params })).rejects.toThrow("not-found");
    expect(mocks.access).toHaveBeenCalledWith("private-file", "requester");
  });

  it("rejects cached funding review after source access is removed", async () => {
    mocks.imp.fundingSourceKey = "email-fingerprint";
    await expect(FundingReviewPage({ params })).rejects.toThrow("not-found");
    expect(mocks.access).toHaveBeenCalledWith("private-file", "requester");
  });

  it("keeps actorless system funding review available to an authorized manager", async () => {
    Object.assign(mocks.imp, { fundingSourceKey: "email-fingerprint", createdBy: null });
    mocks.access.mockResolvedValue({ id: "private-file" });
    const html = renderToStaticMarkup(await FundingReviewPage({ params }));
    expect(html).toContain("Private title");
    expect(mocks.access).toHaveBeenCalledWith("private-file", "requester");
  });

  it("preserves completed project recovery without sending inaccessible cached source props", async () => {
    Object.assign(mocks.imp, { status: "committed", committedProjectIds: ["project"] });
    const html = renderToStaticMarkup(await ImportReviewPage({ params }));
    expect(html).toContain("committed");
    expect(html).not.toContain("Private");
  });

  it("preserves completed funding recovery when the source is no longer available", async () => {
    Object.assign(mocks.imp, { status: "committed", fundingSourceKey: "email-fingerprint", fileId: null });
    mocks.group = { id: "agreement" };
    await expect(FundingReviewPage({ params })).rejects.toThrow("redirect:/agreements/agreement");
  });
});
