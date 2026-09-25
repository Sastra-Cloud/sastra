"use client";

import { useState } from "react";

/**
 * Editable client state that resets when a new server value arrives. React
 * permits this guarded render-time adjustment and it avoids an extra stale
 * render plus the cascading render caused by synchronizing props in an effect.
 */
export function usePropState<T>(source: T) {
  const [previousSource, setPreviousSource] = useState(source);
  const [value, setValue] = useState(source);

  if (source !== previousSource) {
    setPreviousSource(source);
    setValue(source);
  }

  return [value, setValue] as const;
}
