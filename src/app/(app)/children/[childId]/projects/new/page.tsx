import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { createProject } from "../../../project-actions";
import { ProjectForm } from "../project-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return { title: t("new") };
}

export default async function NewProjectPage({ params }: PageProps<"/children/[childId]/projects/new">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child || !atLeast(child.role, "editor")) notFound();
  const t = await getTranslations("projects");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("new")}</h1>
        <p className="text-sm text-muted">{t("newSubtitle", { nickname: child.nickname })}</p>
      </div>
      <Card>
        <ProjectForm action={createProject.bind(null, child.id)} maxVisibility={child.max_visibility} />
      </Card>
    </div>
  );
}
