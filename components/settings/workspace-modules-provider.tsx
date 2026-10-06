"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { setWorkspaceModule } from "@/lib/workspace/actions";
import type { WorkspaceModule } from "@/lib/workspace/modules";

type Change = { module: WorkspaceModule; enabled: boolean };
const updateModules = (current: string[], change: Change) => change.enabled
  ? [...new Set([...current, change.module])]
  : current.filter(key => key !== change.module);
const changeKey = (change: Change) => change.module;
const ModulesContext = createContext<{
  enabledModules: string[]; isPending: (module: WorkspaceModule) => boolean; setModule: (change: Change) => void;
}>({
  enabledModules: [],
  isPending: () => false,
  setModule: () => {},
});

export function WorkspaceModulesProvider({ enabledModules, children }: {
  enabledModules: string[]; children: React.ReactNode;
}) {
  const router = useRouter();
  const action = useOptimisticAction({ state: enabledModules, update: updateModules, getKey: changeKey });
  return <ModulesContext.Provider value={{
    enabledModules: action.state,
    isPending: action.isPending,
    setModule: change => action.run(change, () => setWorkspaceModule(change), {
      errorMessage: "Couldn't save the module setting. Try again.",
      reconcile: (result, current) => result.enabledModules ?? current,
      onSuccess: () => router.refresh(),
    }),
  }}>{children}</ModulesContext.Provider>;
}

export function useWorkspaceModules() { return useContext(ModulesContext); }
