"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-muted-foreground/30 p-0.5 outline-none transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-2.5 focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out data-checked:translate-x-5 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
