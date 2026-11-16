import { describe, expect, it } from "vitest";

import { scanClientActions, scanClientSource } from "./client-action-discovery";

const ACTIONS = "@/lib/tasks/actions";

describe("client action discovery", () => {
  // Protects the "every client mutation is classified" gate: a hook without
  // components around it, and an aliased import, used to ship unclassified.
  it("finds mutations inside client hooks, including aliased imports", () => {
    const hook = scanClientSource(
      "hooks/use-example.ts",
      `import { useState } from "react";
import { setTaskAssignmentDeferred as defer, type TaskResult } from "${ACTIONS}";
export function useExample() { return defer; }`
    );
    expect(hook.actions).toEqual(["setTaskAssignmentDeferred"]);
    expect(hook.diagnostics).toEqual([]);
  });

  it("reads the real directive prologue, not a regex on the first characters", () => {
    const source = `// Shared by the board.\n/* note */\n"use client";\nimport { createTask } from "${ACTIONS}";`;
    expect(scanClientSource("components/a.tsx", source).actions).toEqual(["createTask"]);
    // A string later in the file is not a directive.
    const notClient = `import { createTask } from "${ACTIONS}";\n"use client";`;
    expect(scanClientSource("components/b.tsx", notClient).actions).toEqual([]);
  });

  it("ignores server modules, type-only imports, and non-action modules", () => {
    const server = `"use server";\nimport { createTask } from "${ACTIONS}";`;
    expect(scanClientSource("app/x/actions.ts", server).actions).toEqual([]);
    const types = `"use client";\nimport type { createTask } from "${ACTIONS}";\nimport { type Row } from "${ACTIONS}";\nimport { formatDate } from "@/lib/format";`;
    expect(scanClientSource("components/c.tsx", types).actions).toEqual([]);
  });

  it("reports imports it cannot classify instead of silently skipping them", () => {
    const source = `"use client";\nimport * as tasks from "${ACTIONS}";\nconst later = () => import("${ACTIONS}");`;
    const scan = scanClientSource("components/d.tsx", source);
    expect(scan.actions).toEqual([]);
    expect(scan.diagnostics).toHaveLength(2);
    expect(scan.diagnostics[0]).toContain("namespace import");
    expect(scan.diagnostics[0]).toContain("Use named imports");
    expect(scan.diagnostics[1]).toContain("dynamic import");
  });

  it("finds client re-exports of action modules", () => {
    const source = `"use client";\nexport { updateTaskStatus as setStatus } from "${ACTIONS}";`;
    expect(scanClientSource("components/e.tsx", source).actions).toEqual(["updateTaskStatus"]);
  });

  it("scans real hooks, so the production tree cannot lose that coverage", () => {
    const { actions, diagnostics } = scanClientActions();
    expect(diagnostics).toEqual([]);
    expect(actions).toContain("setTaskAssignmentDeferred");
  });
});
