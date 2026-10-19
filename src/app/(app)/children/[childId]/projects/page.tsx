import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { visibilityIcons } from "@/components/timeline/post-card";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { listProjects } from "@/lib/data/projects";
import { ChildHeader } from "../child-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tabs");
  return { title: t("projects") };
}

export default async function ProjectsPage({ params }: PageProps<"/children/[childId]/projects">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const [t, tv, format, projects] = await Promise.all([
    getTranslations("projects"),
    getTranslations("visibility"),
    getFormatter(),
    listProjects(child.id),
  ]);
  const canEdit = atLeast(child.role, "editor");
  const month = (d: string) => format.dateTime(new Date(`${d}T00:00:00`), { year: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ChildHeader child={child} active="projects" />

      {canEdit && projects.length > 0 && (
        <div className="flex justify-end">
          <Link href={`/children/${child.id}/projects/new`} className={buttonClass("secondary")}>
            + {t("new")}
          </Link>
        </div>
      )}

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">🎹</span>
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted">{t("emptyHint")}</p>
          {canEdit && (
            <Link href={`/children/${child.id}/projects/new`} className={buttonClass("primary", "mt-2")}>
              + {t("new")}
            </Link>
          )}
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/children/${child.id}/projects/${project.id}`}
                className="flex h-full gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary"
              >
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-2xl">
                  {project.emoji ?? "📁"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{project.title}</p>
                  <p className="text-sm text-muted">
                    {t("postCount", { count: project.postCount })}
                    {project.firstOn && project.lastOn && (
                      <>
                        {" · "}
                        {month(project.firstOn) === month(project.lastOn)
                          ? month(project.firstOn)
                          : `${month(project.firstOn)} – ${month(project.lastOn)}`}
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {visibilityIcons[project.visibility]} {tv(project.visibility)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
