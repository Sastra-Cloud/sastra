export const LECTIO_CLOUD_REQUIREMENT = "Lectio requires an active, paid Sastra Cloud workspace or a deployment explicitly managed and approved by the Sastra operator. Other self-hosted instances cannot connect or sync.";

export const WORKSPACE_MODULES = [{
  key: "sponsorships",
  label: "Sponsorships",
  description: "Invoice partners for sponsored books. Track available funds and record how they are used.",
}, {
  key: "lectio",
  label: "Lectio",
  description: "Connect translation projects, people, progress, and files with your Lectio team.",
}] as const;

export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number]["key"];

export function moduleEnabled(enabledModules: readonly string[], module: WorkspaceModule) {
  return enabledModules.includes(module);
}
