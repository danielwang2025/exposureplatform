import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { getPost } from "@/lib/data/posts";
import { listProjects } from "@/lib/data/projects";
import { listSkills } from "@/lib/data/skills";
import { isVideoEnabled } from "@/lib/mux";
import { Composer } from "../../composer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posts");
  return { title: t("editTitle") };
}

export default async function EditPostPage({ params }: PageProps<"/children/[childId]/posts/[postId]/edit">) {
  const { childId, postId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();
  const post = await getPost(child, postId, user.id);
  if (!post || !post.canEdit) notFound();
  const [t, projects, skills] = await Promise.all([
    getTranslations("posts"),
    listProjects(child.id),
    listSkills(child.id),
  ]);
  const rated = new Set(post.ratings?.map((r) => r.skillId));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
      <Card>
        <Composer
          childId={child.id}
          maxVisibility={child.max_visibility}
          videoEnabled={isVideoEnabled()}
          projects={projects}
          skills={skills
            .filter((s) => !s.archived_at || rated.has(s.id))
            .map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, archived: Boolean(s.archived_at) }))}
          canManageSkills={atLeast(child.role, "editor")}
          post={{
            id: post.id,
            kind: post.kind,
            title: post.title,
            body: post.body,
            occurredOn: post.occurredOn,
            visibility: post.visibility,
            projectId: post.project?.id ?? null,
            media: post.media,
            ratings: post.ratings ?? [],
          }}
        />
      </Card>
    </div>
  );
}
