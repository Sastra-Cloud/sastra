/**
 * Test-only discovery of server actions that browser code can invoke.
 *
 * `interaction-policy.test.ts` uses this to prove every client-invoked action
 * has an explicit feedback classification. It parses with the TypeScript
 * compiler, so it must never be imported from runtime code.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";

export type ClientActionScan = {
  /** Original exported names (aliases resolved back to the export). */
  actions: string[];
  /** Imports the scan cannot attribute to an export name. Must stay empty. */
  diagnostics: string[];
};

const CLIENT_ROOTS = ["components", "app", "hooks"] as const;

/** Modules whose imports are invoked from the browser as actions or uploads. */
function isActionModule(moduleName: string) {
  if (!moduleName.startsWith("@/lib/") && !moduleName.startsWith("@/app/")) {
    return false;
  }
  return (
    /(?:actions|action)$/.test(moduleName) ||
    moduleName.endsWith("/push/client") ||
    moduleName.includes("/upload-client")
  );
}

/** Directives are the leading string-literal statements only. */
function directivePrologue(parsed: ts.SourceFile) {
  const directives: string[] = [];
  for (const statement of parsed.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      directives.push(statement.expression.text);
    } else {
      break;
    }
  }
  return directives;
}

function importsServerOnly(parsed: ts.SourceFile) {
  return parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "server-only"
  );
}

/**
 * Hooks are browser-only by construction, so a hook that forgets the
 * directive must not escape the scan. Anything else needs `"use client"`.
 */
function isClientModule(file: string, parsed: ts.SourceFile) {
  const directives = directivePrologue(parsed);
  if (directives.includes("use server") || importsServerOnly(parsed)) {
    return false;
  }
  if (directives.includes("use client")) return true;
  return file.split(path.sep).includes("hooks");
}

export function scanClientSource(file: string, source: string): ClientActionScan {
  const result: ClientActionScan = { actions: [], diagnostics: [] };
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  if (!isClientModule(file, parsed)) return result;

  const diagnose = (moduleName: string, what: string) =>
    result.diagnostics.push(
      `${file}: ${what} of "${moduleName}" hides which actions run in the browser. ` +
        "Use named imports so each action can be classified."
    );

  for (const statement of parsed.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const moduleName = statement.moduleSpecifier.text;
      if (!isActionModule(moduleName)) continue;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) diagnose(moduleName, "default import");
      const bindings = clause.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) {
        diagnose(moduleName, "namespace import");
        continue;
      }
      for (const specifier of bindings.elements) {
        if (specifier.isTypeOnly) continue;
        // `import { a as b }`: the policy is keyed by the exported name `a`.
        result.actions.push((specifier.propertyName ?? specifier.name).text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !statement.isTypeOnly
    ) {
      const moduleName = statement.moduleSpecifier.text;
      if (!isActionModule(moduleName)) continue;
      const exports = statement.exportClause;
      if (!exports || ts.isNamespaceExport(exports)) {
        diagnose(moduleName, "star re-export");
        continue;
      }
      for (const specifier of exports.elements) {
        if (specifier.isTypeOnly) continue;
        result.actions.push((specifier.propertyName ?? specifier.name).text);
      }
    }
  }

  // Dynamic `import("@/lib/x/actions")` has no static binding to classify.
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      isActionModule(node.arguments[0].text)
    ) {
      diagnose(node.arguments[0].text, "dynamic import");
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return result;
}

function isScannedFile(name: string) {
  if (!/\.tsx?$/.test(name) || name.endsWith(".d.ts")) return false;
  return !/\.(?:test|spec)\.tsx?$/.test(name);
}

function walk(directory: string, onFile: (file: string) => void) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    if (entry.name === "fixtures" || entry.name === "__fixtures__") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, onFile);
    else if (isScannedFile(entry.name)) onFile(file);
  }
}

export function scanClientActions(root = process.cwd()): ClientActionScan {
  const actions = new Set<string>();
  const diagnostics: string[] = [];
  for (const name of CLIENT_ROOTS) {
    const directory = path.join(root, name);
    if (!fs.existsSync(directory)) continue;
    walk(directory, (file) => {
      const scan = scanClientSource(
        path.relative(root, file),
        fs.readFileSync(file, "utf8")
      );
      scan.actions.forEach((action) => actions.add(action));
      diagnostics.push(...scan.diagnostics);
    });
  }
  return { actions: [...actions].sort(), diagnostics };
}
