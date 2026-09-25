#!/usr/bin/env node
// Generate a compact, committed codebase index for AI agents.
// Outputs .ai/repo-map.md plus on-demand detail files. Keep repo-map small.

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, ".ai");
const MAX_REPO_MAP_BYTES = 6 * 1024;

const CODE_DIRS = ["app", "components", "hooks", "lib", "scripts"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_RE =
  /(^|\/)(node_modules|\.next|dist|build|coverage|\.turbo|\.ai|\.git|__snapshots__)(\/|$)/;

const DOMAINS = [
  {
    slug: "assistant",
    summary: "In-app AI assistant, tools, approvals, memory, budgets, and UI shell.",
    match: (p) =>
      p.includes("lib/assistant/") ||
      p.includes("components/assistant/") ||
      p.includes("app/(app)/assistant/") ||
      p.includes("app/api/assistant/"),
  },
  {
    slug: "projects-tasks",
    summary: "Projects, phases, task boards, workload ordering, recurring tasks, and task comments.",
    match: (p) =>
      p.includes("lib/projects/") ||
      p.includes("lib/tasks/") ||
      p.includes("components/projects/") ||
      p.includes("components/tasks/") ||
      p.includes("components/workload/") ||
      p.includes("app/(app)/projects/") ||
      p.includes("app/(app)/tasks/") ||
      p.includes("app/(app)/workload/") ||
      p.includes("lib/db/schema/projects.ts") ||
      p.includes("lib/db/schema/tasks.ts") ||
      p.includes("lib/db/schema/templates.ts") ||
      p.includes("lib/db/schema/recurring.ts"),
  },
  {
    slug: "rights-budget",
    summary: "Rights tracking, budget/quotation, royalties, invoices, and blocker health.",
    match: (p) =>
      p.includes("lib/rights/") ||
      p.includes("lib/budget/") ||
      p.includes("lib/blockers/") ||
      p.includes("components/rights/") ||
      p.includes("components/budget/") ||
      p.includes("app/api/invoices/") ||
      p.includes("lib/db/schema/rights.ts") ||
      p.includes("lib/db/schema/budget.ts") ||
      p.includes("lib/db/schema/blockers.ts"),
  },
  {
    slug: "chat-standups",
    summary: "Project chat, live chat streams, standups, AI digesting, and cron jobs.",
    match: (p) =>
      p.includes("lib/chat/") ||
      p.includes("lib/standup/") ||
      p.includes("components/chat/") ||
      p.includes("app/(app)/chat/") ||
      p.includes("app/(app)/standups/") ||
      p.includes("app/api/chat/") ||
      p.includes("app/api/cron/standup/") ||
      p.includes("lib/db/schema/chat.ts") ||
      p.includes("lib/db/schema/standup.ts"),
  },
  {
    slug: "auth-team-settings",
    summary: "Better Auth, team roles, invites, settings pages, profile, and users.",
    match: (p) =>
      p.includes("lib/auth/") ||
      p.includes("lib/team/") ||
      p.includes("lib/users/") ||
      p.includes("components/auth/") ||
      p.includes("components/settings/") ||
      p.includes("app/(auth)/") ||
      p.includes("app/(app)/settings/") ||
      p.includes("app/api/auth/") ||
      p.includes("lib/db/schema/auth.ts"),
  },
  {
    slug: "imports-files-r2",
    summary: "Document imports, file uploads, R2/S3 storage, presigned upload flow, and Drive links.",
    match: (p) =>
      p.includes("lib/imports/") ||
      p.includes("lib/files/") ||
      p.includes("lib/r2/") ||
      p.includes("components/imports/") ||
      p.includes("components/files/") ||
      p.includes("app/(app)/projects/import/") ||
      p.includes("app/api/files/") ||
      p.includes("lib/db/schema/imports.ts") ||
      p.includes("lib/db/schema/files.ts"),
  },
  {
    slug: "pwa-notifications",
    summary: "Push subscriptions, notifications, presence, offline page, and browser instrumentation.",
    match: (p) =>
      p.includes("lib/notifications/") ||
      p.includes("lib/push/") ||
      p.includes("lib/presence/") ||
      p.includes("components/notifications/") ||
      p.includes("components/pwa/") ||
      p.includes("components/presence/") ||
      p.includes("app/api/notifications/") ||
      p.includes("app/api/presence/") ||
      p.includes("app/api/push/") ||
      p.includes("app/offline/") ||
      p === "proxy.ts" ||
      p === "instrumentation.ts" ||
      p.includes("lib/db/schema/notifications.ts") ||
      p.includes("lib/db/schema/presence.ts"),
  },
];

function readSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (IGNORE_RE.test(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_EXT.has(extname(name))) {
      out.push({ full, rel, size: st.size });
    }
  }
  return out;
}

function appRouteFromFile(rel, leafName) {
  const leafRe = new RegExp(`(^|/)${leafName}\\.(t|j)sx?$`);
  const withoutRoot = rel.replace(/^app\//, "").replace(leafRe, "");
  const segments = withoutRoot
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return segments.length ? `/${segments.join("/")}` : "/";
}

function summarizeLargeList(items, max = 60) {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `... ${items.length - max} more`];
}

const allFiles = CODE_DIRS.flatMap((dir) => walk(join(ROOT, dir))).sort((a, b) =>
  a.rel.localeCompare(b.rel)
);

const pageRoutes = allFiles
  .filter((f) => /(^|\/)app\/.*\/page\.(t|j)sx?$/.test(f.rel) || /^app\/page\.(t|j)sx?$/.test(f.rel))
  .map((f) => ({ route: appRouteFromFile(f.rel, "page"), file: f.rel }));

const apiRoutes = allFiles
  .filter((f) => /(^|\/)app\/.*\/route\.(t|j)sx?$/.test(f.rel))
  .map((f) => {
    const src = readSafe(f.full);
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].filter((method) =>
      new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b|export\\s+const\\s+\\{[^}]*\\b${method}\\b`
      ).test(src)
    );
    return { route: appRouteFromFile(f.rel, "route"), methods, file: f.rel };
  });

const symbolRe =
  /^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum|let|var)\s+([A-Za-z0-9_]+)/gm;
const symbols = allFiles.flatMap((f) => {
  const found = [];
  for (const match of readSafe(f.full).matchAll(symbolRe)) {
    found.push({ name: match[1], file: f.rel });
  }
  return found;
});

const importRe = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;
const graph = {};
for (const f of allFiles) {
  const imports = [];
  for (const match of readSafe(f.full).matchAll(importRe)) imports.push(match[1]);
  graph[f.rel] = imports;
}

const schemaFiles = allFiles.filter((f) => f.rel.startsWith("lib/db/schema/"));
const schemaExports = schemaFiles.flatMap((f) => {
  const src = readSafe(f.full);
  const entries = [];
  for (const match of src.matchAll(/^export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(pgTable|pgEnum)\b/gm)) {
    entries.push({ name: match[1], kind: match[2], file: f.rel });
  }
  return entries;
});

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "domains"), { recursive: true });

const domainRows = DOMAINS.map((domain) => ({
  ...domain,
  files: allFiles.filter((f) => domain.match(f.rel)),
})).filter((domain) => domain.files.length > 0);

const repoMap = [
  "# Repo Map",
  "",
  "Auto-generated by `pnpm ai:map`. Do not edit by hand.",
  "",
  "## Stack",
  "",
  "- Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Drizzle/Postgres, Better Auth.",
  "- Read `AGENTS.md` first for operating rules, especially Next 16 docs and UI browser verification.",
  "",
  "## Commands",
  "",
  "- `pnpm dev` - local dev server on port 3243",
  "- `pnpm typecheck` - TypeScript",
  "- `pnpm lint` - ESLint",
  "- `pnpm test` - Vitest",
  "- `pnpm build` - production build",
  "- `pnpm db:generate` / `pnpm db:migrate` - Drizzle migrations",
  "",
  "## Counts",
  "",
  `- Code files scanned: ${allFiles.length}`,
  `- Page routes: ${pageRoutes.length}`,
  `- API route handlers: ${apiRoutes.length}`,
  `- Exported symbols: ${symbols.length}`,
  `- Drizzle schema exports: ${schemaExports.length}`,
  "",
  "## On-demand Detail Files",
  "",
  "- `.ai/routes.md` - page/API route listing",
  "- `.ai/symbols.md` - exported symbols grouped by file",
  "- `.ai/db-schema.md` - Drizzle table/enum exports",
  "- `.ai/dependency-graph.json` - import graph",
  "- `.ai/domains/*.md` - task-specific file clusters",
  "",
  "## Domains",
  "",
  ...domainRows.map((domain) => `- \`${domain.slug}\` (${domain.files.length} files): ${domain.summary}`),
  "",
  "## Entry Points",
  "",
  ...CODE_DIRS.filter((dir) => allFiles.some((f) => f.rel.startsWith(`${dir}/`))).map((dir) => `- \`${dir}/\``),
  "",
].join("\n");

const repoMapBytes = Buffer.byteLength(repoMap, "utf8");
if (repoMapBytes > MAX_REPO_MAP_BYTES) {
  console.error(
    `.ai/repo-map.md would be ${repoMapBytes} bytes; cap is ${MAX_REPO_MAP_BYTES}. Tighten the template first.`
  );
  process.exit(1);
}

writeFileSync(join(OUT, "repo-map.md"), repoMap);

writeFileSync(
  join(OUT, "routes.md"),
  [
    "# Routes",
    "",
    "## Pages",
    "",
    ...pageRoutes.map((r) => `- \`${r.route}\` -> \`${r.file}\``),
    "",
    "## API Route Handlers",
    "",
    ...apiRoutes.map((r) => `- \`${r.methods.join(" | ") || "?"}\` \`${r.route}\` -> \`${r.file}\``),
    "",
  ].join("\n")
);

const symbolsByFile = new Map();
for (const symbol of symbols) {
  const list = symbolsByFile.get(symbol.file) ?? [];
  list.push(symbol.name);
  symbolsByFile.set(symbol.file, list);
}
writeFileSync(
  join(OUT, "symbols.md"),
  [
    "# Exported Symbols",
    "",
    ...[...symbolsByFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, names]) => `## \`${file}\`\n\n- ${names.sort().join(", ")}\n`),
  ].join("\n")
);

const schemaByFile = new Map();
for (const entry of schemaExports) {
  const list = schemaByFile.get(entry.file) ?? [];
  list.push(entry);
  schemaByFile.set(entry.file, list);
}
writeFileSync(
  join(OUT, "db-schema.md"),
  [
    "# Drizzle Schema",
    "",
    "Table and enum exports parsed from `lib/db/schema/`.",
    "",
    ...[...schemaByFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, entries]) => {
        const names = entries
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((entry) => `- \`${entry.name}\` (${entry.kind})`);
        return [`## \`${file}\``, "", ...names, ""].join("\n");
      }),
  ].join("\n")
);

writeFileSync(join(OUT, "dependency-graph.json"), JSON.stringify(graph, null, 2));

for (const domain of domainRows) {
  writeFileSync(
    join(OUT, "domains", `${domain.slug}.md`),
    [
      `# Domain: ${domain.slug}`,
      "",
      domain.summary,
      "",
      "Read this when the task touches this domain. Use the file list as a starting map, then inspect the specific files you edit.",
      "",
      "## Files",
      "",
      ...summarizeLargeList(domain.files.map((f) => `- \`${f.rel}\``), 90),
      "",
    ].join("\n")
  );
}

console.log(`.ai regenerated: repo-map.md ${repoMapBytes} bytes, ${allFiles.length} files scanned.`);
