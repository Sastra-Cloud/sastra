"use client";

import { createContext, useContext } from "react";

import { usePropState } from "@/hooks/use-prop-state";
import type { ActiveTimer } from "@/lib/tasks/time-queries";

type ActiveTimerContextValue = {
  activeTimer: ActiveTimer | null;
  setActiveTimer: React.Dispatch<React.SetStateAction<ActiveTimer | null>>;
};

const ActiveTimerContext = createContext<ActiveTimerContextValue | null>(null);

export function ActiveTimerProvider({
  initialActiveTimer,
  children,
}: {
  initialActiveTimer: ActiveTimer | null;
  children: React.ReactNode;
}) {
  const [activeTimer, setActiveTimer] = usePropState(initialActiveTimer);

  return (
    <ActiveTimerContext value={{ activeTimer, setActiveTimer }}>
      {children}
    </ActiveTimerContext>
  );
}

export function useActiveTimer() {
  const value = useContext(ActiveTimerContext);
  if (!value) {
    throw new Error("useActiveTimer must be used within ActiveTimerProvider");
  }
  return value;
}
