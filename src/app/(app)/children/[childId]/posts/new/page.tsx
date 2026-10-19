import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { postKinds } from "@/lib/data/posts";
import { listProjects } from "@/lib/data/projects";
import { listSkills } from "@/lib/data/skills";
import { isVideoEnabled } from "@/lib/mux";
import { Composer } from "../composer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posts");
  return { title: t("new") };
}

export default async function NewPostPage({ params, searchParams }: PageProps<"/children/[childId]/posts/new">) {
  const { childId } = await params;
  const { project, kind } = await searchParams;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child || !atLeast(child.role, "editor")) notFound();
  const [t, projects, skills] = await Promise.all([
    getTranslations("posts"),
    listProjects(child.id),
    listSkills(child.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("newFor", { nickname: child.nickname })}</h1>
      <Card>
        <Composer
          childId={child.id}
          maxVisibility={child.max_visibility}
          videoEnabled={isVideoEnabled()}
          projects={projects}
          skills={skills.filter((s) => !s.archived_at).map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, archived: false }))}
          canManageSkills
          defaultKind={postKinds.find((k) => k === kind)}
          defaultProjectId={typeof project === "string" && projects.some((p) => p.id === project) ? project : undefined}
        />
      </Card>
    </div>
  );
}
