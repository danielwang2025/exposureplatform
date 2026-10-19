import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { getProject } from "@/lib/data/projects";
import { updateProject } from "../../../../project-actions";
import { ProjectForm } from "../../project-form";
import { DeleteProjectButton } from "./delete-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return { title: t("edit") };
}

export default async function EditProjectPage({ params }: PageProps<"/children/[childId]/projects/[projectId]/edit">) {
  const { childId, projectId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child || !atLeast(child.role, "editor")) notFound();
  const project = await getProject(child.id, projectId);
  if (!project) notFound();
  const t = await getTranslations("projects");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">{t("edit")}</h1>
      <Card>
        <ProjectForm
          action={updateProject.bind(null, child.id, project.id)}
          maxVisibility={child.max_visibility}
          defaults={{
            title: project.title,
            description: project.description,
            emoji: project.emoji,
            visibility: project.visibility,
          }}
        />
      </Card>
      <Card className="space-y-2 border-danger/40">
        <h2 className="font-medium">{t("deleteTitle")}</h2>
        <p className="text-sm text-muted">{t("deleteBody")}</p>
        <DeleteProjectButton childId={child.id} projectId={project.id} />
      </Card>
    </div>
  );
}
