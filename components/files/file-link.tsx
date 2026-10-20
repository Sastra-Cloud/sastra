import type { ComponentProps } from "react";
import { fileLinkAttributes } from "@/lib/files/link-attributes";

/** File responses need browser navigation rather than Next.js page navigation. */
export function FileLink({ href, intent, ...props }: Omit<ComponentProps<"a">, "href" | "target" | "download" | "rel"> & {
  href: string;
  intent?: "download" | "preview";
}) {
  return <a {...props} {...fileLinkAttributes(href, intent)} />;
}
