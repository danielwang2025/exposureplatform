import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShareLinkButton } from "@/components/share-link-button";
import { ProgressChart } from "@/components/skills/progress-chart";
import { Timeline } from "@/components/timeline/timeline";
import { visibilityIcons } from "@/components/timeline/post-card";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { listTimeline } from "@/lib/data/posts";
import { getProject } from "@/lib/data/projects";
import { computeProgress } from "@/lib/progress";

export async function generateMetadata({ params }: PageProps<"/children/[childId]/projects/[projectId]">): Promise<Metadata> {
  const { childId, projectId } = await params;
  const project = await getProject(childId, projectId);
  return { title: project?.title };
}

export default async function ProjectPage({ params }: PageProps<"/children/[childId]/projects/[projectId]">) {
  const { childId, projectId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();
  const project = await getProject(child.id, projectId);
  if (!project) notFound();

  const [t, tv, tTabs, { posts }] = await Promise.all([
    getTranslations("projects"),
    getTranslations("visibility"),
    getTranslations("tabs"),
    // A project reads as a journey: oldest first.
    listTimeline(child, user.id, { limit: 200, projectId: project.id, oldestFirst: true }),
  ]);
  const canEdit = atLeast(child.role, "editor");
  const progress = computeProgress(posts);
  const base = `/children/${child.id}/projects/${project.id}`;
  const shareable = child.role === "owner" && (project.visibility === "link" || project.visibility === "public");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/children/${child.id}/projects`} className="text-sm text-primary hover:underline">
        ← {child.nickname} · {tTabs("projects")}
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
          {project.emoji ?? "📁"}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          {project.description && <p className="whitespace-pre-wrap text-muted">{project.description}</p>}
          <p className="text-xs text-muted">
            {t("postCount", { count: posts.length })} · {visibilityIcons[project.visibility]} {tv(project.visibility)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link href={`/children/${child.id}/posts/new?project=${project.id}`} className={buttonClass("primary")}>
            + {t("addProgress")}
          </Link>
        )}
        {canEdit && (
          <Link href={`${base}/edit`} className={buttonClass("secondary")}>
            {t("edit")}
          </Link>
        )}
        {shareable && <ShareLinkButton childId={child.id} input={{ scope: "project", projectId: project.id }} />}
      </div>
      {child.role === "owner" && !shareable && <p className="text-xs text-muted">{t("shareHint")}</p>}

      {progress && <ProgressChart progress={progress} />}

      {posts.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">{t("noPosts")}</Card>
      ) : (
        <Timeline posts={posts} card={{ variant: "member", childId: child.id, birthDate: child.birth_date, isOwner: child.role === "owner" }} />
      )}
    </div>
  );
}
