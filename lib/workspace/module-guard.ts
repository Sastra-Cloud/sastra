import "server-only";

import { getWorkspaceSettings } from "./queries";
import { moduleEnabled, type WorkspaceModule } from "./modules";

export async function requireWorkspaceModule(module: WorkspaceModule) {
  const settings = await getWorkspaceSettings();
  if (!moduleEnabled(settings.enabledModules, module)) {
    throw new Error("This module is disabled. Ask an admin to enable it in Settings → Modules.");
  }
  return settings;
}
