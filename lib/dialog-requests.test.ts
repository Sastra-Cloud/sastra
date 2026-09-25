import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { cancelDialogs, confirmDialog, currentDialog, promptDialog, settleDialog } from "./dialog-requests";
afterEach(cancelDialogs);
it("waits for a decision before allowing a mutation", async () => {
 let performed = false;
 const action = (async () => { if (await confirmDialog("Delete item?")) performed = true; })();
 expect(performed).toBe(false);
 settleDialog(currentDialog()!.id, false);
 await action;
 expect(performed).toBe(false);
});
it("accepts once and advances queued requests", async () => {
 const first = confirmDialog("Delete item?");
 const id = currentDialog()!.id;
 const second = confirmDialog("Send reply?");
 settleDialog(id, true);
 settleDialog(id, false);
 expect(await first).toBe(true);
 expect(currentDialog()?.message).toBe("Send reply?");
 cancelDialogs();
 expect(await second).toBe(false);
});
it("preserves entered values and distinguishes blank from cancel", async () => {
 const blank = promptDialog("Email (optional)");
 settleDialog(currentDialog()!.id, "");
 expect(await blank).toBe("");
 const text = promptDialog("Name");
 settleDialog(currentDialog()!.id, "Partner");
 expect(await text).toBe("Partner");
 const cancelled = promptDialog("Name");
 cancelDialogs();
 expect(await cancelled).toBeNull();
});
it("cancels every pending operation on navigation/unmount", async () => {
 const requests = [confirmDialog("Delete?"), promptDialog("Name"), confirmDialog("Send?")];
 cancelDialogs();
 expect(await Promise.all(requests)).toEqual([false, null, false]);
 expect(currentDialog()).toBeNull();
});
it("keeps native browser dialogs out of application components", () => {
 const found: string[] = [];
 function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
   const file = path.join(dir, entry.name);
   if (entry.isDirectory()) { walk(file); continue; }
   if (!/\.[jt]sx?$/.test(file)) continue;
   const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
   const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^(?:window\.)?(?:confirm|alert|prompt)$/.test(node.expression.getText(ast))) found.push(file);
    ts.forEachChild(node, visit);
   };
   visit(ast);
  }
 }
 walk("components"); walk("app");
 expect(found).toEqual([]);
});
