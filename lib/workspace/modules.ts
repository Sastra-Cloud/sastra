export const WORKSPACE_MODULES = [{
  key: "sponsorships",
  label: "Sponsorships",
  description: "Invoice partners for sponsored books. Track available funds and record how they are used.",
}] as const;

export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number]["key"];

export function moduleEnabled(enabledModules: readonly string[], module: WorkspaceModule) {
  return enabledModules.includes(module);
}
