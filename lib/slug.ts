export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

/**
 * A project slug guaranteed unique against existing rows (appends -2, -3, …).
 * Pass a `taken` set when creating several projects in one batch (e.g. a
 * multi-project document import) so siblings don't collide before their rows
 * are committed; chosen slugs are added to it.
 */
export async function uniqueProjectSlug(
  title: string,
  taken?: Set<string>
): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 1;
  // Small loop — fine for a single team's project volume.
  while (true) {
    const clash =
      taken?.has(candidate) ||
      (
        await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.slug, candidate))
          .limit(1)
      ).length > 0;
    if (!clash) {
      taken?.add(candidate);
      return candidate;
    }
    n += 1;
    candidate = `${base}-${n}`;
  }
}
