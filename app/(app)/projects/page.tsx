import Link from "next/link";
import { FolderKanban, Layers3, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listProjects } from "@/lib/projects/queries";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { Reveal } from "@/components/motion/reveal";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, session] = await Promise.all([listProjects(), requireUser()]);
  const isManager = can(session.user, "project.edit");

  return (
    <div className="w-full space-y-6">
      <Reveal className="surface-shadow flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <FolderKanban className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Projects
            </h1>
            <p className="text-muted-foreground">
              Plan, sequence, and unblock the team portfolio.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {isManager ? (
            <Link
              href="/agreements"
              className={buttonVariants({ variant: "outline" })}
            >
              <Layers3 className="size-4" />
              Shared MoUs
            </Link>
          ) : null}
          {isManager ? <Link href="/projects/new" className={buttonVariants()}><Plus className="size-4" />Create project</Link> : null}
        </div>
      </Reveal>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="size-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                {isManager ? "Create your first project to start planning." : "Ask a manager to create a project and assign your work."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ProjectsBrowser projects={projects} />
      )}
    </div>
  );
}
