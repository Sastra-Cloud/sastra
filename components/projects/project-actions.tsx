"use client";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
export function ProjectActions({ children }: { children: React.ReactNode }) {
  return <Popover><PopoverTrigger render={<Button variant="outline" size="sm" />}>
    Project actions <ChevronDown className="size-4" />
  </PopoverTrigger><PopoverContent align="end" className="grid w-64 gap-2">{children}</PopoverContent></Popover>;
}
