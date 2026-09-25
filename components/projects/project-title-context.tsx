"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { ViewTransition, createContext, useContext, useState } from "react";

import { Button } from "@/components/ui/button";

type ProjectTitleContextValue = {
  title: string;
  setTitle: (title: string) => void;
};

const ProjectTitleContext = createContext<ProjectTitleContextValue | null>(null);

export function ProjectTitleProvider({
  initialTitle,
  children,
}: {
  initialTitle: string;
  children: React.ReactNode;
}) {
  const [source, setSource] = useState(initialTitle);
  const [title, setTitle] = useState(initialTitle);

  if (source !== initialTitle) {
    setSource(initialTitle);
    setTitle(initialTitle);
  }

  return (
    <ProjectTitleContext value={{ title, setTitle }}>
      {children}
    </ProjectTitleContext>
  );
}

export function useProjectTitle() {
  const value = useContext(ProjectTitleContext);
  if (!value) {
    throw new Error("useProjectTitle must be used within ProjectTitleProvider");
  }
  return value;
}

export function ProjectTitleHeading({
  projectSlug,
  canEdit,
}: {
  projectSlug: string;
  canEdit: boolean;
}) {
  const { title } = useProjectTitle();

  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <ViewTransition
        name={`project-title-${projectSlug}`}
        share={{
          "project-detail": "project-title-morph",
          "project-list": "project-title-morph",
          default: "none",
        }}
        default="none"
      >
        <span className="min-w-0 text-pretty">{title}</span>
      </ViewTransition>
      {canEdit ? (
        <Button
          nativeButton={false}
          render={
            <Link href={`/projects/${projectSlug}?settings=1&focus=name`} />
          }
          variant="ghost"
          size="icon-xs"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Edit project name"
          title="Edit project name"
        >
          <Pencil className="size-3.5" />
        </Button>
      ) : null}
    </span>
  );
}
